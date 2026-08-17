import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { TokenCipherService } from '../common/crypto/token-cipher.service';
import { hasText } from '../common/utils/text';
import type { AppEnvironment } from '../config/env.validation';
import {
  ContentType,
  ScheduleFrequency,
  SelectionStrategy,
  type Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SlackClientFactory } from '../slack/slack-client.factory';
import { CreateStreamDto } from '../streams/dto/stream.dto';
import { StreamsService } from '../streams/streams.service';
import {
  oauthEnterpriseInstallUnsupported,
  oauthExchangeFailed,
  oauthNotConfigured,
} from './slack-oauth.errors';

/**
 * `im:history` is required for `SlackEventsService.onMessage`'s plain-text `subscribe`/
 * `unsubscribe` DM path (`message.im` events); `commands` for every slash command
 * (`/subscribe`, `/unsubscribe`, `/settings`, `/aya`, `/hadith`) — `/settings`/`/aya`/`/hadith`
 * have no DM-text equivalent, so they need `commands` but not an extra `im:history` grant.
 * Omitting either scope would silently regress a feature the app already ships.
 */
export const OAUTH_BOT_SCOPES = ['chat:write', 'commands', 'im:history'] as const;

const DEFAULT_STREAM_NAME = 'Daily Aya & Hadith';
const DEFAULT_STREAM_SEND_TIME = '09:00';
const OAUTH_INSTALL_ACTOR_ID = 'slack-oauth-install';

export type WorkspaceRecord = Prisma.SlackWorkspaceGetPayload<object>;

export interface CompletedInstall {
  workspace: WorkspaceRecord;
  isReinstall: boolean;
  /** Whether a default stream exists for this workspace by the time this returns — either
   *  because provisioning just succeeded, or one already existed from a prior install. `false`
   *  only when provisioning was attempted and failed; the caller should say so, not stay silent. */
  hasDefaultStream: boolean;
}

@Injectable()
export class SlackOauthService {
  private readonly logger = new Logger(SlackOauthService.name);
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly appBaseUrl: string;
  private readonly defaultTimezone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tokenCipher: TokenCipherService,
    private readonly clientFactory: SlackClientFactory,
    private readonly streamsService: StreamsService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.clientId = config.get('SLACK_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('SLACK_CLIENT_SECRET', { infer: true });
    this.appBaseUrl = config.get('APP_BASE_URL', { infer: true });
    this.defaultTimezone = config.get('DEFAULT_TIMEZONE', { infer: true });
  }

  isConfigured(): boolean {
    return hasText(this.clientId) && hasText(this.clientSecret) && this.tokenCipher.isConfigured();
  }

  buildAuthorizeUrl(state: string): string {
    if (!hasText(this.clientId) || !this.isConfigured()) {
      throw oauthNotConfigured();
    }

    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('scope', OAUTH_BOT_SCOPES.join(','));
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('state', state);

    return url.toString();
  }

  async completeInstall(code: string): Promise<CompletedInstall> {
    if (!hasText(this.clientId) || !hasText(this.clientSecret) || !this.isConfigured()) {
      throw oauthNotConfigured();
    }

    const client = new WebClient();
    let response;

    try {
      response = await client.oauth.v2.access({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri(),
      });
    } catch (error) {
      throw oauthExchangeFailed(error instanceof Error ? error.message : 'unknown_error');
    }

    // No usable `team.id`: an enterprise-wide install grants across every workspace in the org,
    // which `SlackWorkspace.slackTeamId` (unique, non-null) has no way to represent.
    if (response.is_enterprise_install === true) {
      throw oauthEnterpriseInstallUnsupported();
    }

    const slackTeamId = response.team?.id;
    const botToken = response.access_token;

    if (!hasText(slackTeamId) || !hasText(botToken)) {
      throw oauthExchangeFailed('Slack response was missing team.id or access_token.');
    }

    const teamName = response.team?.name;
    const botUserId = response.bot_user_id;
    const scopes = response.scope;
    const appId = response.app_id;
    const installedByUserId = response.authed_user?.id;
    const botTokenCiphertext = this.tokenCipher.encrypt(botToken);
    const installedAt = new Date();

    const { workspace, isReinstall } = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.slackWorkspace.findUnique({
        where: { slackTeamId },
        select: { id: true },
      });

      const record = await transaction.slackWorkspace.upsert({
        where: { slackTeamId },
        create: {
          slackTeamId,
          name: teamName ?? slackTeamId,
          botUserId: botUserId ?? null,
          // Not resolved by SlackClientFactory (that reads botTokenCiphertext); kept only as a
          // human-readable label, since the column is NOT NULL.
          tokenSecretKey: `oauth:${slackTeamId}`,
          isActive: true,
          botTokenCiphertext,
          scopes: scopes ?? null,
          appId: appId ?? null,
          installedByUserId: installedByUserId ?? null,
          installedAt,
        },
        update: {
          name: teamName ?? undefined,
          botUserId: botUserId ?? null,
          isActive: true,
          botTokenCiphertext,
          scopes: scopes ?? null,
          appId: appId ?? null,
          installedByUserId: installedByUserId ?? null,
          installedAt,
        },
      });

      await this.auditService.record(transaction, {
        actorId: installedByUserId ?? 'unknown-slack-user',
        action: AuditAction.WORKSPACE_INSTALLED,
        entityType: AuditEntityType.WORKSPACE,
        entityId: record.id,
        workspaceId: record.id,
        metadata: { slackTeamId, scopes, isReinstall: existing !== null },
      });

      return { workspace: record, isReinstall: existing !== null };
    });

    // A reinstall may carry a new token for a workspace whose client is still cached from the
    // prior install; without this, `SlackClientFactory` would keep serving the stale one.
    this.clientFactory.evict(workspace.id);

    const hasDefaultStream = await this.ensureDefaultStream(workspace.id);

    return { workspace, isReinstall, hasDefaultStream };
  }

  private async ensureDefaultStream(workspaceId: string): Promise<boolean> {
    const existing = await this.prisma.scheduleStream.findFirst({
      where: { workspaceId },
      select: { id: true },
    });

    if (existing !== null) {
      return true;
    }

    const dto: CreateStreamDto = {
      workspaceId,
      name: DEFAULT_STREAM_NAME,
      frequency: ScheduleFrequency.DAILY,
      sendTime: DEFAULT_STREAM_SEND_TIME,
      timezone: this.defaultTimezone,
      allowedContentTypes: [ContentType.AYAH, ContentType.HADITH],
      selectionStrategy: SelectionStrategy.ALTERNATE_BY_TYPE,
      actorId: OAUTH_INSTALL_ACTOR_ID,
    };

    try {
      await this.streamsService.create(dto, OAUTH_INSTALL_ACTOR_ID);
      return true;
    } catch (error) {
      // The workspace install itself already succeeded and must not be rolled back for this —
      // an admin can create the stream by hand. Surface it loudly instead of failing silently,
      // and tell the caller so the confirmation page doesn't claim a stream that doesn't exist.
      this.logger.error(
        { event: 'default_stream_provisioning_failed', workspaceId },
        error instanceof Error ? error.stack : undefined,
      );
      return false;
    }
  }

  private redirectUri(): string {
    return `${this.appBaseUrl}/api/v1/slack/oauth/callback`;
  }
}
