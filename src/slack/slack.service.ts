import { Injectable, Logger } from '@nestjs/common';
import type { WebClient } from '@slack/web-api';
import { TokenCipherService } from '../common/crypto/token-cipher.service';
import { hasText } from '../common/utils/text';
import { PrismaService } from '../prisma/prisma.service';
import { workspaceNotFound } from '../workspaces/workspaces.errors';
import { SlackClientFactory } from './slack-client.factory';
import { type NormalizedSlackError, normalizeSlackError } from './slack-error.mapper';
import {
  slackNotConfigured,
  slackSendFailed,
  slackTokenInvalid,
  slackTokenWorkspaceMismatch,
  workspaceInactive,
} from './slack.errors';
import type {
  SlackAuthIdentity,
  SlackGateway,
  SlackMessage,
  SlackPostResult,
} from './slack.gateway';

interface ResolvedWorkspace {
  client: WebClient;
  slackTeamId: string;
}

/**
 * The only database access in this module, and it reads nothing but `SlackWorkspace`. It exists
 * because PLAN.md §12.3 keys the gateway by `workspaceId`; §7.4's "rendering must not query the
 * database" applies to the renderers, which have no Prisma access at all by construction.
 */
@Injectable()
export class SlackService implements SlackGateway {
  private readonly logger = new Logger(SlackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientFactory: SlackClientFactory,
    private readonly tokenCipher: TokenCipherService,
  ) {}

  async verifyToken(workspaceId: string): Promise<SlackAuthIdentity> {
    const { client, slackTeamId } = await this.resolveWorkspace(workspaceId);

    let result;
    try {
      result = await client.auth.test();
    } catch (error) {
      throw slackTokenInvalid(this.record('slack_auth_test_failed', error, { workspaceId }));
    }

    const actualTeamId = typeof result.team_id === 'string' ? result.team_id : '';

    // Without this check a production token would happily "verify" a development workspace row.
    if (actualTeamId !== slackTeamId) {
      throw slackTokenWorkspaceMismatch(slackTeamId, actualTeamId);
    }

    return {
      teamId: actualTeamId,
      teamName: typeof result.team === 'string' ? result.team : undefined,
      botUserId: typeof result.user_id === 'string' ? result.user_id : undefined,
      url: typeof result.url === 'string' ? result.url : undefined,
    };
  }

  async postMessage(workspaceId: string, message: SlackMessage): Promise<SlackPostResult> {
    const { client } = await this.resolveWorkspace(workspaceId);

    let result;
    try {
      result = await client.chat.postMessage({
        channel: message.channel,
        text: message.text,
        blocks: message.blocks,
      });
    } catch (error) {
      throw slackSendFailed(
        this.record('slack_post_message_failed', error, {
          workspaceId,
          channelId: message.channel,
        }),
      );
    }

    if (typeof result.ts !== 'string') {
      throw slackSendFailed({
        code: 'unknown_error',
        message: 'Slack accepted the message but returned no timestamp.',
        retryable: false,
      });
    }

    return { channel: result.channel ?? message.channel, ts: result.ts };
  }

  private async resolveWorkspace(workspaceId: string): Promise<ResolvedWorkspace> {
    const workspace = await this.prisma.slackWorkspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, slackTeamId: true, botTokenCiphertext: true, isActive: true },
    });

    if (workspace === null) {
      throw workspaceNotFound(workspaceId);
    }

    if (!workspace.isActive) {
      throw workspaceInactive(workspaceId);
    }

    if (!hasText(workspace.botTokenCiphertext)) {
      throw slackNotConfigured(workspaceId);
    }

    const token = this.tokenCipher.decrypt(workspace.botTokenCiphertext);

    return {
      client: this.clientFactory.getClientForWorkspace(workspaceId, token),
      slackTeamId: workspace.slackTeamId,
    };
  }

  /**
   * Normalizes and logs a Slack failure. The SDK error object is never handed to the logger: an
   * underlying HTTP error carries the request configuration, including the `Bearer xoxb-…`
   * authorization header, which pino's error serializer would happily print.
   */
  private record(
    event: string,
    error: unknown,
    context: { workspaceId: string; channelId?: string },
  ): NormalizedSlackError {
    const normalized = normalizeSlackError(error);

    this.logger.warn({
      event,
      ...context,
      code: normalized.code,
      retryable: normalized.retryable,
      rawStatusCode: normalized.rawStatusCode,
      retryAfterSeconds: normalized.retryAfterSeconds,
    });

    return normalized;
  }
}
