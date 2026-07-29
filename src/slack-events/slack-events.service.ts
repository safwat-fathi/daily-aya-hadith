import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogLevel, SocketModeClient } from '@slack/socket-mode';
import type { AppEnvironment } from '../config/env.validation';
import { hasText } from '../common/utils/text';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribersService } from '../subscribers/subscribers.service';
import { SLACK_GATEWAY, SlackGateway } from '../slack/slack.gateway';

/**
 * `SocketModeClient` extends `EventEmitter`, so its listener payloads arrive as `any`. These
 * describe only what is read here, with `unknown` fields so every value must still be narrowed
 * before use — Slack's payload shape is external input, not a guarantee.
 */
type SlackAck = (response?: unknown) => Promise<void>;

interface SlashCommandEnvelope {
  ack: SlackAck;
  body?: { command?: unknown; user_id?: unknown; team_id?: unknown };
}

interface MessageEnvelope {
  ack?: SlackAck;
  body?: { team_id?: unknown };
  event?: {
    text?: unknown;
    user?: unknown;
    team?: unknown;
    bot_id?: unknown;
    subtype?: unknown;
  };
}

const SUBSCRIBE_TEXT = 'You are subscribed to Daily Aya & Hadith. Send `/unsubscribe` to stop.';
const UNSUBSCRIBE_TEXT =
  'You are unsubscribed from Daily Aya & Hadith. Send `/subscribe` to resume.';
const FAILURE_TEXT = 'Sorry — that could not be processed right now. Please try again in a moment.';

/**
 * Inbound Slack events over Socket Mode, so no public URL is needed.
 *
 * Slack requires an acknowledgement within three seconds, so every handler acks first and does
 * its work afterwards. A failure after the ack is reported to the user with a direct message:
 * a silent no-op is indistinguishable from success from the sender's point of view.
 */
@Injectable()
export class SlackEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlackEventsService.name);
  private readonly appToken: string | undefined;
  private client: SocketModeClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscribersService: SubscribersService,
    @Inject(SLACK_GATEWAY) private readonly slackGateway: SlackGateway,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.appToken = config.get('SLACK_APP_TOKEN', { infer: true });
  }

  async onModuleInit(): Promise<void> {
    if (!hasText(this.appToken)) {
      this.logger.warn(
        'SLACK_APP_TOKEN is not set; Socket Mode will not start and slash commands will not be received.',
      );
      return;
    }

    this.client = new SocketModeClient({ appToken: this.appToken, logLevel: LogLevel.ERROR });

    // `void` because the emitter expects a synchronous listener; the promise is handled inside.
    this.client.on('slash_commands', (envelope: SlashCommandEnvelope) => {
      void this.onSlashCommand(envelope);
    });

    this.client.on('message', (envelope: MessageEnvelope) => {
      void this.onMessage(envelope);
    });

    try {
      await this.client.start();
      this.logger.log('Connected to Slack Socket Mode.');
    } catch (error) {
      this.logger.error('Failed to start Slack Socket Mode', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  private async onSlashCommand({ body, ack }: SlashCommandEnvelope): Promise<void> {
    // Acknowledge first: Slack shows "the app did not respond" after three seconds.
    await ack();

    const command = body?.command;
    const userId = body?.user_id;
    const teamId = body?.team_id;

    if (!hasText(command) || !hasText(userId) || !hasText(teamId)) {
      return;
    }

    if (command === '/subscribe' || command === '/unsubscribe') {
      await this.handleSubscriptionToggle(teamId, userId, command === '/subscribe');
    }
  }

  private async onMessage({ event, body, ack }: MessageEnvelope): Promise<void> {
    await ack?.();

    // Ignore anything the bot posted, including our own confirmation replies, and every
    // message subtype (edits, joins, file shares) that is not a plain user message.
    if (event?.bot_id !== undefined || event?.subtype !== undefined) {
      return;
    }

    const text = event?.text;
    const userId = event?.user;
    const teamId = event?.team ?? body?.team_id;

    if (!hasText(text) || !hasText(userId) || !hasText(teamId)) {
      return;
    }

    const normalized = text.trim().toLowerCase().replace(/^\//, '');

    if (normalized === 'subscribe' || normalized === 'unsubscribe') {
      await this.handleSubscriptionToggle(teamId, userId, normalized === 'subscribe');
    }
  }

  private async handleSubscriptionToggle(
    slackTeamId: string,
    slackUserId: string,
    isSubscribing: boolean,
  ): Promise<void> {
    const workspace = await this.prisma.slackWorkspace.findUnique({ where: { slackTeamId } });

    // Nothing can be said to the user here: replying needs a workspace to resolve a token from.
    if (workspace === null) {
      this.logger.warn({ event: 'slack_event_unknown_workspace', slackTeamId, slackUserId });
      return;
    }

    try {
      await this.applyToggle(workspace.id, slackUserId, isSubscribing);
      await this.reply(
        workspace.id,
        slackUserId,
        isSubscribing ? SUBSCRIBE_TEXT : UNSUBSCRIBE_TEXT,
      );
    } catch (error) {
      this.logger.error(
        { event: 'slack_subscription_toggle_failed', slackUserId, isSubscribing },
        error instanceof Error ? error.stack : undefined,
      );
      await this.replyQuietly(workspace.id, slackUserId, FAILURE_TEXT);
    }
  }

  private async applyToggle(
    workspaceId: string,
    slackUserId: string,
    isSubscribing: boolean,
  ): Promise<void> {
    const existing = await this.subscribersService.getByUserId(workspaceId, slackUserId);

    if (existing === null) {
      if (isSubscribing) {
        await this.subscribersService.create(
          { workspaceId, slackUserId, actorId: slackUserId, isActive: true },
          'socket-mode',
        );
      }
      return;
    }

    // Repeating the same command is a no-op rather than a redundant write, so `/subscribe`
    // twice leaves one active row and one audit event.
    if (existing.isActive !== isSubscribing) {
      await this.subscribersService.update(
        existing.id,
        { isActive: isSubscribing, actorId: slackUserId },
        'socket-mode',
      );
    }
  }

  private async reply(workspaceId: string, slackUserId: string, message: string): Promise<void> {
    await this.slackGateway.postMessage(workspaceId, {
      channel: slackUserId,
      text: message,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: message } }],
    });
  }

  /** Best-effort notification on a path that is already failing; never masks the original error. */
  private async replyQuietly(
    workspaceId: string,
    slackUserId: string,
    message: string,
  ): Promise<void> {
    try {
      await this.reply(workspaceId, slackUserId, message);
    } catch {
      this.logger.warn({ event: 'slack_failure_notice_undeliverable', slackUserId });
    }
  }
}
