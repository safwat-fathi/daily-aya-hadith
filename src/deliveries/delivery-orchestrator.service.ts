import { Inject, Injectable, Logger } from '@nestjs/common';
import type { KnownBlock } from '@slack/types';
import { DateTime } from 'luxon';
import { CLOCK, type Clock } from '../common/clock/clock';
import { toInputJsonArray } from '../common/utils/prisma-json';
import { localDateFor, parseSendTime } from '../common/utils/schedule-time';
import { Prisma } from '../generated/prisma/client';
import { DeliveryStatus, DeliveryTriggerType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { NormalizedSlackError } from '../slack/slack-error.mapper';
import { RenderWarning } from '../slack/renderers/slack-text';
import { SlackBlockRenderer } from '../slack/slack-block.renderer';
import { SlackOperationException } from '../slack/slack.errors';
import { SLACK_GATEWAY, type SlackGateway } from '../slack/slack.gateway';
import type { StreamRecord, SubscriberRecord } from '../streams/streams.service';
import { ContentSelectionService } from './content-selection.service';
import { deliveryWithContextArgs } from './deliveries.select';

type RunRecord = Prisma.DeliveryRunGetPayload<object>;
type ContentDeliveryRecord = Prisma.ContentDeliveryGetPayload<object>;

const NO_ELIGIBLE_CONTENT = 'NO_ELIGIBLE_CONTENT';
const CONTENT_EXCEEDS_SEND_LIMITS = 'CONTENT_EXCEEDS_SEND_LIMITS';

/**
 * PLAN.md §5.23: only warnings that stem from a Slack-enforced hard limit refuse a send.
 * `SOFT_BUDGET` is explicitly "advisory only" (`slack-text.ts`) and must never be included here —
 * the full ayah template routinely clears the soft 3,000-character budget while rendering
 * correctly, so refusing on it would make ordinary content permanently unsendable. Exported so
 * `SlackEventsService`'s instant `/aya`/`/hadith` commands — which render and post directly,
 * outside this file's reservation/retry path — apply the same refusal rule.
 */
export const SEND_BLOCKING_WARNINGS: readonly string[] = [
  RenderWarning.BLOCK_COUNT,
  RenderWarning.SECTION_SPLIT,
];

/** PLAN.md §5.17: "up to three times" via a fixed backoff, not a queue. */
function backoffSeconds(attemptCount: number): number {
  const backoffMinutes = Math.min(60, 5 * 3 ** (attemptCount - 1));
  return backoffMinutes * 60;
}

/**
 * A process that dies between claiming a delivery (`SENDING`) and recording its outcome leaves
 * that row stuck: the sweep's own `FAILED` query can't see it, and the admin retry endpoint
 * rejects anything that isn't `FAILED`. `retrySweep` also reclaims `SENDING` rows whose
 * `sendingAt` is older than this — comfortably beyond the Slack client's 10s call timeout
 * (`slack-client.factory.ts`), so a row this stale can only be orphaned, never genuinely
 * in-flight. `sendDelivery`'s claim `updateMany` re-checks `sendingAt` at claim time, so a
 * truly still-in-flight row (fresh `sendingAt`) can never be reclaimed out from under it.
 */
const SENDING_STALE_RECOVERY_MS = 2 * 60_000;

/**
 * PLAN.md §11.4–§11.5: the two-level reservation transaction plus the send/retry path that
 * consumes it. `reserveRun` and `reserveSubscriberDelivery` are the only places `DeliveryRun`/
 * `ContentDelivery` rows are created; `sendDelivery` is the only place a *scheduled or retried*
 * delivery posts a Slack message, and it is reused unchanged by the first attempt, the admin
 * retry endpoint, and the automatic retry sweep — always resending the run's stored snapshot,
 * never re-rendering (§12.5). The instant `/aya`/`/hadith` commands (`SlackEventsService`) post
 * directly through `SlackGateway` instead, deliberately outside this reservation/retry machinery
 * — they are on-demand, single-shot sends with no `DeliveryRun`/`ContentDelivery` bookkeeping.
 */
@Injectable()
export class DeliveryOrchestratorService {
  private readonly logger = new Logger(DeliveryOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentSelection: ContentSelectionService,
    private readonly blockRenderer: SlackBlockRenderer,
    @Inject(SLACK_GATEWAY) private readonly slackGateway: SlackGateway,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async deliverToSubscriber(
    stream: StreamRecord,
    subscriber: SubscriberRecord,
    nowUtc: Date,
  ): Promise<void> {
    const localDate = localDateFor(nowUtc, subscriber.timezone);
    const run = await this.reserveRun(stream, localDate, DeliveryTriggerType.SCHEDULED);

    if (run.status === DeliveryStatus.SKIPPED) {
      return;
    }

    const delivery = await this.reserveSubscriberDelivery(run.id, subscriber.id);

    if (delivery === null) {
      return;
    }

    await this.sendDelivery(delivery.id);
  }

  /**
   * Two independent recoveries in one pass:
   *  - `FAILED`/`isRetryable` deliveries whose `nextRetryAt` has passed, bounded by the owning
   *    stream's `maxAutomaticAttempts`. That bound can't be expressed as a single Prisma `where`
   *    (a row's own `attemptCount` compared against a joined relation's field), so candidates are
   *    fetched first and filtered in application code.
   *  - `SENDING` deliveries stale enough to be orphaned by a crash mid-send (see
   *    `SENDING_STALE_RECOVERY_MS`). These are deliberately **not** bounded by
   *    `maxAutomaticAttempts`: the goal is only to push a stuck row to a terminal state
   *    (`SENT`/`FAILED`), not to grant extra retry budget — `sendDelivery` already stops setting
   *    `nextRetryAt` once the cap is reached, so this can't loop forever.
   */
  async retrySweep(nowUtc: Date): Promise<void> {
    const failedCandidates = await this.prisma.contentDelivery.findMany({
      where: {
        status: DeliveryStatus.FAILED,
        isRetryable: true,
        nextRetryAt: { lte: nowUtc },
      },
      include: { run: { include: { stream: { select: { maxAutomaticAttempts: true } } } } },
    });

    const eligibleFailed = failedCandidates.filter(
      (delivery) => delivery.attemptCount < delivery.run.stream.maxAutomaticAttempts,
    );

    const staleSending = await this.prisma.contentDelivery.findMany({
      where: {
        status: DeliveryStatus.SENDING,
        sendingAt: { lte: new Date(nowUtc.getTime() - SENDING_STALE_RECOVERY_MS) },
      },
    });

    for (const delivery of [...eligibleFailed, ...staleSending]) {
      try {
        await this.sendDelivery(delivery.id);
      } catch (error) {
        this.logger.error({
          event: 'delivery_retry_sweep_unhandled_error',
          deliveryId: delivery.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async reserveRun(
    stream: StreamRecord,
    localDate: Date,
    triggerType: DeliveryTriggerType,
  ): Promise<RunRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.deliveryRun.findUnique({
            where: {
              streamId_deliveryLocalDate: { streamId: stream.id, deliveryLocalDate: localDate },
            },
          });

          if (existing !== null) {
            return existing;
          }

          return this.createRun(tx, stream, localDate, triggerType);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (this.isRunReservationRace(error)) {
        const existing = await this.prisma.deliveryRun.findUnique({
          where: {
            streamId_deliveryLocalDate: { streamId: stream.id, deliveryLocalDate: localDate },
          },
        });

        if (existing !== null) {
          return existing;
        }
      }

      throw error;
    }
  }

  private async createRun(
    tx: Prisma.TransactionClient,
    stream: StreamRecord,
    localDate: Date,
    triggerType: DeliveryTriggerType,
  ): Promise<RunRecord> {
    const content = await this.contentSelection.select(tx, stream);

    if (content === null) {
      this.logger.warn({
        event: 'delivery_run_skipped',
        streamId: stream.id,
        workspaceId: stream.workspaceId,
        deliveryLocalDate: localDate.toISOString(),
        errorCode: NO_ELIGIBLE_CONTENT,
      });

      return tx.deliveryRun.create({
        data: {
          streamId: stream.id,
          triggerType,
          status: DeliveryStatus.SKIPPED,
          deliveryLocalDate: localDate,
          skippedAt: this.clock.now(),
          errorCode: NO_ELIGIBLE_CONTENT,
        },
      });
    }

    // The canonical render, in the stream's own locale — this is what gates the whole run and is
    // what every subscriber gets unless their own `locale` matches the secondary render below.
    const rendered = this.blockRenderer.render(content, { locale: stream.locale });
    const exceedsSendLimits = rendered.warnings.some((warning) =>
      SEND_BLOCKING_WARNINGS.includes(warning),
    );

    if (exceedsSendLimits) {
      // contentId stays set (unlike the no-eligible-content case above) so the next cycle's LRU
      // ordering sees this item as just used and naturally deprioritizes it instead of retrying
      // the same oversize content forever.
      this.logger.warn({
        event: 'delivery_run_skipped',
        streamId: stream.id,
        workspaceId: stream.workspaceId,
        deliveryLocalDate: localDate.toISOString(),
        contentId: content.id,
        errorCode: CONTENT_EXCEEDS_SEND_LIMITS,
        warnings: rendered.warnings,
      });

      return tx.deliveryRun.create({
        data: {
          streamId: stream.id,
          contentId: content.id,
          triggerType,
          status: DeliveryStatus.SKIPPED,
          deliveryLocalDate: localDate,
          skippedAt: this.clock.now(),
          errorCode: CONTENT_EXCEEDS_SEND_LIMITS,
          renderedText: rendered.text,
          renderedBlocks: toInputJsonArray(rendered.blocks),
          rendererVersion: rendered.rendererVersion,
        },
      });
    }

    // `'en'` is the only other supported locale (`UserSubscriber.locale`) — rendered
    // unconditionally alongside the canonical one so any subscriber on this run can receive their
    // own language, per PLAN.md's original "one shared cycle" design extended to "one shared
    // cycle, rendered once per supported locale". Unlike the canonical render above, an oversize
    // `'en'` render does *not* skip the run — it's stored as-is, and if Slack itself rejects it at
    // send time, only that one subscriber's delivery fails and retries, same as any other send
    // failure (see `sendDelivery`).
    const renderedEn = this.blockRenderer.render(content, { locale: 'en' });

    const run = await tx.deliveryRun.create({
      data: {
        streamId: stream.id,
        contentId: content.id,
        triggerType,
        status: DeliveryStatus.SENT,
        deliveryLocalDate: localDate,
        scheduledFor: this.computeScheduledFor(stream, localDate),
        renderedText: rendered.text,
        renderedBlocks: toInputJsonArray(rendered.blocks),
        renderedTextEn: renderedEn.text,
        renderedBlocksEn: toInputJsonArray(renderedEn.blocks),
        rendererVersion: rendered.rendererVersion,
      },
    });

    this.logger.log({
      event: 'delivery_run_selected',
      streamId: stream.id,
      workspaceId: stream.workspaceId,
      deliveryRunId: run.id,
      deliveryLocalDate: localDate.toISOString(),
      contentId: content.id,
    });

    return run;
  }

  private async reserveSubscriberDelivery(
    runId: string,
    subscriberId: string,
  ): Promise<ContentDeliveryRecord | null> {
    try {
      return await this.prisma.contentDelivery.create({
        data: { runId, subscriberId, status: DeliveryStatus.PENDING },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }

      throw error;
    }
  }

  /**
   * The only place a *scheduled or retried* delivery posts a Slack message (the instant
   * `/aya`/`/hadith` commands post separately — see the class docstring). Reused unchanged by the
   * first attempt, the admin retry endpoint, and the automatic sweep: every caller resends
   * exactly the locale variant originally picked for this subscriber, never re-rendering.
   */
  async sendDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.contentDelivery.findUniqueOrThrow({
      where: { id: deliveryId },
      ...deliveryWithContextArgs,
    });

    const { run, subscriber } = delivery;

    if (run.renderedText === null || run.renderedBlocks === null) {
      throw new Error(`Delivery run "${run.id}" has no rendered snapshot; cannot send.`);
    }

    // Canonical by default; the `'en'` variant only when the subscriber asked for it *and* one
    // was actually rendered for this run (older rows predating `renderedTextEn` fall back here
    // too, since both are null on them).
    let renderedText = run.renderedText;
    let renderedBlocks = run.renderedBlocks as unknown as KnownBlock[];
    if (
      subscriber.locale === 'en' &&
      run.renderedTextEn !== null &&
      run.renderedBlocksEn !== null
    ) {
      renderedText = run.renderedTextEn;
      renderedBlocks = run.renderedBlocksEn as unknown as KnownBlock[];
    }

    const attemptCount = delivery.attemptCount + 1;
    const startedAt = this.clock.now();

    // Optimistic claim: the admin retry endpoint and the automatic sweep can both reach the same
    // row at once (a FAILED row, or a SENDING row stale enough for the sweep to reclaim as
    // crash-orphaned — see SENDING_STALE_RECOVERY_MS). Only the caller whose `updateMany`
    // actually matches gets to send; the loser sees count 0 and backs off. Re-checking
    // `sendingAt` here, not just at the sweep's query time, is what keeps a genuinely in-flight
    // SENDING row (fresh `sendingAt`) unreachable by this branch.
    const claimed = await this.prisma.contentDelivery.updateMany({
      where: {
        id: deliveryId,
        OR: [
          { status: { in: [DeliveryStatus.PENDING, DeliveryStatus.FAILED] } },
          {
            status: DeliveryStatus.SENDING,
            sendingAt: { lte: new Date(startedAt.getTime() - SENDING_STALE_RECOVERY_MS) },
          },
        ],
      },
      data: {
        status: DeliveryStatus.SENDING,
        sendingAt: startedAt,
        lastAttemptAt: startedAt,
        attemptCount,
      },
    });

    if (claimed.count !== 1) {
      this.logger.warn({
        event: 'delivery_send_claim_lost',
        deliveryId,
        runId: run.id,
        subscriberId: subscriber.id,
      });
      return;
    }

    try {
      const result = await this.slackGateway.postMessage(run.stream.workspaceId, {
        channel: subscriber.slackUserId,
        text: renderedText,
        blocks: renderedBlocks,
      });

      await this.prisma.contentDelivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.SENT,
          sentAt: this.clock.now(),
          slackChannelId: result.channel,
          slackMessageTs: result.ts,
          errorCode: null,
          errorMessage: null,
          isRetryable: null,
          nextRetryAt: null,
        },
      });

      this.logger.log({
        event: 'delivery_sent',
        deliveryId,
        runId: run.id,
        streamId: run.streamId,
        subscriberId: subscriber.id,
        attemptCount,
      });
    } catch (error) {
      const normalized = this.normalizeFailure(error);
      const nextRetryAt =
        normalized.retryable && attemptCount < run.stream.maxAutomaticAttempts
          ? new Date(
              startedAt.getTime() +
                Math.max(normalized.retryAfterSeconds ?? 0, backoffSeconds(attemptCount)) * 1000,
            )
          : null;

      await this.prisma.contentDelivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.FAILED,
          failedAt: this.clock.now(),
          errorCode: normalized.code,
          errorMessage: normalized.message,
          isRetryable: normalized.retryable,
          nextRetryAt,
        },
      });

      this.logger.warn({
        event: 'delivery_failed',
        deliveryId,
        runId: run.id,
        streamId: run.streamId,
        subscriberId: subscriber.id,
        attemptCount,
        errorCode: normalized.code,
        retryable: normalized.retryable,
      });
    }
  }

  private normalizeFailure(error: unknown): NormalizedSlackError {
    if (error instanceof SlackOperationException) {
      return error.normalized;
    }

    this.logger.error({
      event: 'delivery_unexpected_error',
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      code: 'unknown_error',
      message: 'An unexpected error occurred while sending.',
      retryable: false,
    };
  }

  /**
   * Informational only: the UTC instant `stream.sendTime` corresponds to on `localDate` in
   * `stream.timezone`. Uses the stream's display-only reference zone deliberately — this field
   * is not read by any scheduling decision (§8.1 note 8).
   */
  private computeScheduledFor(stream: StreamRecord, localDate: Date): Date | null {
    const parsed = parseSendTime(stream.sendTime);

    if (parsed === null) {
      return null;
    }

    const localDateUtc = DateTime.fromJSDate(localDate, { zone: 'utc' });
    const scheduled = DateTime.fromObject(
      {
        year: localDateUtc.year,
        month: localDateUtc.month,
        day: localDateUtc.day,
        hour: parsed.hour,
        minute: parsed.minute,
      },
      { zone: stream.timezone },
    );

    return scheduled.isValid ? scheduled.toJSDate() : null;
  }

  /** §11.5: a concurrent `Serializable` transaction can fail with either error code. */
  private isRunReservationRace(error: unknown): boolean {
    return this.isUniqueViolation(error) || this.isSerializationConflict(error);
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private isSerializationConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
  }
}
