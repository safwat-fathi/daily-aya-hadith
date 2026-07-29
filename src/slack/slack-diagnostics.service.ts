import { Inject, Injectable } from '@nestjs/common';
import type { KnownBlock } from '@slack/types';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { escapeSlackText } from './renderers/slack-text';
import { SLACK_GATEWAY, type SlackGateway } from './slack.gateway';
import type { SendTestMessageDto } from './dto/slack-test-message.dto';

/**
 * The connectivity message is a frozen, server-authored constant. It contains no religious
 * content and is not derived from any `ContentItem`, which is what stops this endpoint becoming
 * a delivery path that bypasses Phase 4's idempotency and duplicate protection.
 */
const TEST_MESSAGE_TEXT = 'Connectivity check from the Aya & Hadith bot. No content was delivered.';

export interface SlackTestMessageResult {
  workspaceId: string;
  channelId: string;
  messageTs: string;
  postedAt: Date;
}

@Injectable()
export class SlackDiagnosticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(SLACK_GATEWAY) private readonly slack: SlackGateway,
  ) {}

  async sendTestMessage(
    dto: SendTestMessageDto,
    requestId: string,
  ): Promise<SlackTestMessageResult> {
    const postedAt = new Date();
    const result = await this.slack.postMessage(dto.workspaceId, {
      channel: dto.channelId,
      text: escapeSlackText(TEST_MESSAGE_TEXT),
      blocks: this.blocks(requestId, postedAt),
    });

    // Slack call first, transaction second: never hold a database transaction open across a
    // network round trip. `AuditService.record` requires a transaction client.
    await this.prisma.$transaction(async (transaction) => {
      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.SLACK_TEST_MESSAGE_SENT,
        entityType: AuditEntityType.WORKSPACE,
        entityId: dto.workspaceId,
        workspaceId: dto.workspaceId,
        requestId,
        metadata: { channelId: dto.channelId, slackMessageTs: result.ts },
      });
    });

    return {
      workspaceId: dto.workspaceId,
      channelId: result.channel,
      messageTs: result.ts,
      postedAt,
    };
  }

  private blocks(requestId: string, postedAt: Date): KnownBlock[] {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Connectivity check*\nSent by the Aya & Hadith admin API to confirm Slack posting works. This is not scheduled content.`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            // The request ID is caller-influenced through the inbound X-Request-Id header.
            text: `requestId \`${escapeSlackText(requestId)}\` · ${postedAt.toISOString()}`,
          },
        ],
      },
    ];
  }
}
