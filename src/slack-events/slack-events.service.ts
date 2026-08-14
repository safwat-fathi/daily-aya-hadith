import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogLevel, SocketModeClient } from '@slack/socket-mode';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import type { AppEnvironment } from '../config/env.validation';
import { CLOCK, type Clock } from '../common/clock/clock';
import { isIanaTimeZone } from '../common/validators/is-iana-timezone.validator';
import { SEND_TIME_PATTERN } from '../common/utils/schedule-time';
import { hasText } from '../common/utils/text';
import { ContentSelectionService } from '../deliveries/content-selection.service';
import { SEND_BLOCKING_WARNINGS } from '../deliveries/delivery-orchestrator.service';
import { ContentType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SlackBlockRenderer } from '../slack/slack-block.renderer';
import { SlackClientFactory } from '../slack/slack-client.factory';
import type { SubscriberRecord } from '../subscribers/subscribers.service';
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
  body?: { command?: unknown; text?: unknown; user_id?: unknown; team_id?: unknown };
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

interface AppUninstalledEnvelope {
  ack?: SlackAck;
  body?: { team_id?: unknown };
}

const SUBSCRIBE_TEXT = 'You are subscribed to Daily Aya & Hadith. Send `/unsubscribe` to stop.';
const UNSUBSCRIBE_TEXT =
  'You are unsubscribed from Daily Aya & Hadith. Send `/subscribe` to resume.';
const FAILURE_TEXT = 'Sorry — that could not be processed right now. Please try again in a moment.';
const CONTENT_TOO_LARGE_TEXT = "That item can't be displayed here right now — please try again.";

// Mirror `UserSubscriber`'s own `@default`s (prisma/schema.prisma), so a subscriber with no row
// yet sees exactly what they'd get if one were created right now.
const DEFAULT_SUBSCRIBER_TIMEZONE = 'Africa/Cairo';
const DEFAULT_SUBSCRIBER_LOCALE = 'ar';

const SETTINGS_HINT_LINES = [
  'To change your settings:',
  '• `/settings time HH:mm` — set your personal send time, e.g. `/settings time 07:30`',
  "• `/settings time default` — clear your custom send time and use each stream's own default",
  '• `/settings timezone <IANA zone>` — set your timezone, e.g. `/settings timezone Europe/London`',
  '• `/settings language ar` or `/settings language en` — set your content language',
];

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
    private readonly clientFactory: SlackClientFactory,
    private readonly auditService: AuditService,
    private readonly contentSelection: ContentSelectionService,
    private readonly blockRenderer: SlackBlockRenderer,
    @Inject(SLACK_GATEWAY) private readonly slackGateway: SlackGateway,
    @Inject(CLOCK) private readonly clock: Clock,
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

    // Fired when a workspace admin removes the app from Slack's side. `tokens_revoked` (partial
    // token revocation, e.g. a single user's grant) is deliberately not handled here — this only
    // reacts to the whole-workspace uninstall signal.
    this.client.on('app_uninstalled', (envelope: AppUninstalledEnvelope) => {
      void this.onAppUninstalled(envelope);
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
    // Slack always sends `text`, but it's legitimately empty for a bare `/settings` — no
    // `hasText` gate here, unlike the identity fields above.
    const text = typeof body?.text === 'string' ? body.text : '';

    if (!hasText(command) || !hasText(userId) || !hasText(teamId)) {
      return;
    }

    if (command === '/subscribe' || command === '/unsubscribe') {
      await this.handleSubscriptionToggle(teamId, userId, command === '/subscribe');
      return;
    }

    if (command === '/settings') {
      await this.handleSettings(teamId, userId, text);
      return;
    }

    if (command === '/aya' || command === '/hadith') {
      await this.handleInstantContent(
        teamId,
        userId,
        command === '/aya' ? ContentType.AYAH : ContentType.HADITH,
      );
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

  private async onAppUninstalled({ body, ack }: AppUninstalledEnvelope): Promise<void> {
    await ack?.();

    const teamId = body?.team_id;

    if (!hasText(teamId)) {
      return;
    }

    const workspace = await this.prisma.slackWorkspace.findUnique({
      where: { slackTeamId: teamId },
    });

    // Nothing to deactivate, or already deactivated by a prior delivery of this event.
    if (workspace === null || !workspace.isActive) {
      return;
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.slackWorkspace.update({
        where: { id: workspace.id },
        data: { isActive: false, botTokenCiphertext: null, uninstalledAt: this.clock.now() },
      });

      await this.auditService.record(transaction, {
        actorId: 'slack-app-uninstalled-event',
        action: AuditAction.WORKSPACE_UNINSTALLED,
        entityType: AuditEntityType.WORKSPACE,
        entityId: workspace.id,
        workspaceId: workspace.id,
        metadata: { slackTeamId: teamId },
      });
    });

    // Without this, a cached client holding the now-revoked token would keep being reused until
    // process restart, generating failing deliveries for a workspace that no longer exists.
    this.clientFactory.evict(workspace.id);

    this.logger.log({ event: 'slack_workspace_uninstalled', slackTeamId: teamId });
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

  /**
   * `/aya`/`/hadith`: a random `APPROVED` item of the given type, rendered fresh in the caller's
   * own `locale` (or `'ar'` if they have no subscriber row) and posted directly — deliberately
   * outside `DeliveryOrchestratorService`'s reservation/retry machinery, since this is a
   * one-shot, on-demand fetch rather than part of any stream's cycle. Works for anyone who can
   * message the bot, whether or not they are an active subscriber.
   */
  private async handleInstantContent(
    slackTeamId: string,
    slackUserId: string,
    type: ContentType,
  ): Promise<void> {
    const workspace = await this.prisma.slackWorkspace.findUnique({ where: { slackTeamId } });

    if (workspace === null) {
      this.logger.warn({ event: 'slack_event_unknown_workspace', slackTeamId, slackUserId });
      return;
    }

    try {
      const subscriber = await this.subscribersService.getByUserId(workspace.id, slackUserId);
      const locale = subscriber?.locale ?? DEFAULT_SUBSCRIBER_LOCALE;
      const content = await this.contentSelection.selectRandomByType(type);

      if (content === null) {
        await this.reply(workspace.id, slackUserId, this.noContentText(type));
        return;
      }

      const rendered = this.blockRenderer.render(content, { locale });
      const isBlocked = rendered.warnings.some((warning) =>
        SEND_BLOCKING_WARNINGS.includes(warning),
      );

      if (isBlocked) {
        this.logger.warn({
          event: 'slack_instant_content_blocked',
          slackUserId,
          type,
          contentId: content.id,
          warnings: rendered.warnings,
        });
        await this.reply(workspace.id, slackUserId, CONTENT_TOO_LARGE_TEXT);
        return;
      }

      await this.slackGateway.postMessage(workspace.id, {
        channel: slackUserId,
        text: rendered.text,
        blocks: rendered.blocks,
      });
    } catch (error) {
      this.logger.error(
        { event: 'slack_instant_content_failed', slackUserId, type },
        error instanceof Error ? error.stack : undefined,
      );
      await this.replyQuietly(workspace.id, slackUserId, FAILURE_TEXT);
    }
  }

  private noContentText(type: ContentType): string {
    const label = type === ContentType.AYAH ? 'aya' : 'hadith';
    return `No ${label} content is available right now. Please try again later.`;
  }

  /**
   * `/settings`: bare shows current values plus hints; `time`/`timezone`/`language` change one
   * preference at a time. All replies are in English, matching `SUBSCRIBE_TEXT`/`FAILURE_TEXT` —
   * only Aya/Hadith content itself is localized, never the bot's own messages.
   */
  private async handleSettings(
    slackTeamId: string,
    slackUserId: string,
    rawText: string,
  ): Promise<void> {
    const workspace = await this.prisma.slackWorkspace.findUnique({ where: { slackTeamId } });

    if (workspace === null) {
      this.logger.warn({ event: 'slack_event_unknown_workspace', slackTeamId, slackUserId });
      return;
    }

    try {
      const args = rawText.trim().length > 0 ? rawText.trim().split(/\s+/) : [];

      if (args.length === 0) {
        const existing = await this.subscribersService.getByUserId(workspace.id, slackUserId);
        await this.reply(workspace.id, slackUserId, this.currentSettingsText(existing));
        return;
      }

      const [subcommand, ...rest] = args;
      const value = rest.join(' ');

      switch (subcommand.toLowerCase()) {
        case 'time':
          await this.handleSettingsTime(workspace.id, slackUserId, value);
          break;
        case 'timezone':
          await this.handleSettingsTimezone(workspace.id, slackUserId, value);
          break;
        case 'language':
          await this.handleSettingsLanguage(workspace.id, slackUserId, value);
          break;
        default:
          await this.reply(
            workspace.id,
            slackUserId,
            `I didn't understand that.\n\n${SETTINGS_HINT_LINES.join('\n')}`,
          );
      }
    } catch (error) {
      this.logger.error(
        { event: 'slack_settings_failed', slackUserId },
        error instanceof Error ? error.stack : undefined,
      );
      await this.replyQuietly(workspace.id, slackUserId, FAILURE_TEXT);
    }
  }

  private currentSettingsText(subscriber: SubscriberRecord | null): string {
    const sendTime =
      subscriber?.sendTime ?? "not set — you receive content at each stream's own send time";
    const timezone = subscriber?.timezone ?? `${DEFAULT_SUBSCRIBER_TIMEZONE} (default)`;
    const locale =
      (subscriber?.locale ?? DEFAULT_SUBSCRIBER_LOCALE) === 'en' ? 'English (en)' : 'Arabic (ar)';
    // These preferences take effect on scheduled sends only once someone is actually
    // subscribed — surfacing that here so setting language/time alone is never mistaken for
    // having opted in to the daily/weekly send.
    const subscribed = subscriber?.isActive
      ? 'yes'
      : 'no — send `/subscribe` to start receiving scheduled content';

    return [
      'Your current settings:',
      `• Subscribed: ${subscribed}`,
      `• Send time: ${sendTime}`,
      `• Timezone: ${timezone}`,
      `• Content language: ${locale}`,
      '',
      ...SETTINGS_HINT_LINES,
    ].join('\n');
  }

  private async handleSettingsTime(
    workspaceId: string,
    slackUserId: string,
    value: string,
  ): Promise<void> {
    const normalized = value.trim();

    if (['default', 'clear', 'reset'].includes(normalized.toLowerCase())) {
      const subscriber = await this.getOrCreateSubscriber(workspaceId, slackUserId);
      await this.subscribersService.update(
        subscriber.id,
        { sendTime: null, actorId: slackUserId },
        'socket-mode',
      );
      await this.reply(
        workspaceId,
        slackUserId,
        "Your send time now follows each stream's own default.",
      );
      return;
    }

    if (!SEND_TIME_PATTERN.test(normalized)) {
      await this.reply(
        workspaceId,
        slackUserId,
        "That doesn't look like a valid time. Use 24-hour HH:mm, e.g. `/settings time 07:30`.",
      );
      return;
    }

    const subscriber = await this.getOrCreateSubscriber(workspaceId, slackUserId);
    await this.subscribersService.update(
      subscriber.id,
      { sendTime: normalized, actorId: slackUserId },
      'socket-mode',
    );
    await this.reply(
      workspaceId,
      slackUserId,
      `Your send time is now ${normalized}. You'll receive daily content around this time in your timezone.`,
    );
  }

  private async handleSettingsTimezone(
    workspaceId: string,
    slackUserId: string,
    value: string,
  ): Promise<void> {
    const timezone = value.trim();

    if (!isIanaTimeZone(timezone)) {
      await this.reply(
        workspaceId,
        slackUserId,
        "That doesn't look like a valid timezone. Use an IANA zone name, e.g. `Africa/Cairo` or `Europe/London`.",
      );
      return;
    }

    const subscriber = await this.getOrCreateSubscriber(workspaceId, slackUserId);
    await this.subscribersService.update(
      subscriber.id,
      { timezone, actorId: slackUserId },
      'socket-mode',
    );
    await this.reply(workspaceId, slackUserId, `Your timezone is now set to ${timezone}.`);
  }

  private async handleSettingsLanguage(
    workspaceId: string,
    slackUserId: string,
    value: string,
  ): Promise<void> {
    const locale = value.trim().toLowerCase();

    if (locale !== 'ar' && locale !== 'en') {
      await this.reply(
        workspaceId,
        slackUserId,
        'Supported languages are `ar` (Arabic) and `en` (English).',
      );
      return;
    }

    const subscriber = await this.getOrCreateSubscriber(workspaceId, slackUserId);
    await this.subscribersService.update(
      subscriber.id,
      { locale, actorId: slackUserId },
      'socket-mode',
    );
    await this.reply(
      workspaceId,
      slackUserId,
      `Your content language is now ${locale === 'en' ? 'English' : 'Arabic'}.`,
    );
  }

  /**
   * `/settings` must never implicitly subscribe someone — only `/subscribe` does that — so a
   * freshly created row is always `isActive: false`, unlike `applyToggle`'s subscribe path.
   */
  private async getOrCreateSubscriber(
    workspaceId: string,
    slackUserId: string,
  ): Promise<SubscriberRecord> {
    const existing = await this.subscribersService.getByUserId(workspaceId, slackUserId);

    if (existing !== null) {
      return existing;
    }

    return this.subscribersService.create(
      { workspaceId, slackUserId, actorId: slackUserId, isActive: false },
      'socket-mode',
    );
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
