import { Injectable, Logger } from '@nestjs/common';
import { ContentStatus, ContentType, SelectionStrategy } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { StreamRecord } from '../streams/streams.service';

export type SelectableContent = Prisma.ContentItemGetPayload<{
  include: { sources: true };
}>;

/**
 * PLAN.md §5.14, including the `ALTERNATE_BY_TYPE` rotation strategy. Runs inside
 * `DeliveryOrchestratorService.reserveRun`'s `Serializable` transaction when selecting content
 * for a new cycle, and read-only (against the base `PrismaService`, no transaction) for the
 * `GET /streams/:id/next-content` dry run.
 */
@Injectable()
export class ContentSelectionService {
  private readonly logger = new Logger(ContentSelectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async select(
    client: Prisma.TransactionClient,
    stream: StreamRecord,
  ): Promise<SelectableContent | null> {
    const eligible = await client.contentItem.findMany({
      where: {
        status: ContentStatus.APPROVED,
        type: { in: stream.allowedContentTypes },
        locale: stream.locale,
      },
      include: { sources: true },
    });

    if (eligible.length === 0) {
      return null;
    }

    const lastSentAtByContentId = await this.lastSentAtByContentId(client, stream.id);

    if (stream.selectionStrategy === SelectionStrategy.RANDOM_WITHOUT_REPLACEMENT) {
      return this.selectRandomWithoutReplacement(eligible, lastSentAtByContentId);
    }

    if (stream.selectionStrategy === SelectionStrategy.ALTERNATE_BY_TYPE) {
      return this.selectAlternateByType(client, stream, eligible, lastSentAtByContentId);
    }

    return this.selectLeastRecentlySent(eligible, lastSentAtByContentId);
  }

  /** Read-only preview used by `GET /streams/:id/next-content`. Creates and reserves nothing. */
  async preview(stream: StreamRecord): Promise<SelectableContent | null> {
    return this.select(this.prisma, stream);
  }

  /**
   * Uniform-random pick for the instant `/aya`/`/hadith` commands: not scoped to any stream, not
   * filtered by locale (display language is a rendering choice — see `RenderContext.locale` —
   * not a content-pool filter), and not tracked in `DeliveryRun`'s least-recently-sent
   * bookkeeping, since an on-demand fetch is deliberately outside every stream's rotation.
   */
  async selectRandomByType(type: ContentType): Promise<SelectableContent | null> {
    const eligible = await this.prisma.contentItem.findMany({
      where: { status: ContentStatus.APPROVED, type },
      include: { sources: true },
    });

    if (eligible.length === 0) {
      return null;
    }

    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  private async lastSentAtByContentId(
    client: Prisma.TransactionClient,
    streamId: string,
  ): Promise<Map<string, Date>> {
    const rows = await client.deliveryRun.groupBy({
      by: ['contentId'],
      where: { streamId, contentId: { not: null } },
      _max: { createdAt: true },
    });

    const map = new Map<string, Date>();
    for (const row of rows) {
      if (row.contentId !== null && row._max.createdAt !== null) {
        map.set(row.contentId, row._max.createdAt);
      }
    }

    return map;
  }

  /**
   * The `ContentType` of the most recently *selected* item for this stream, or null if no prior
   * run ever carried a `contentId`. Note this is "selected", not "successfully sent": a `SKIPPED`
   * run can still carry a non-null `contentId` — see `DeliveryOrchestratorService.createRun`'s
   * `CONTENT_EXCEEDS_SEND_LIMITS` branch, which deliberately keeps `contentId` set on an oversize
   * item specifically so it's treated as "just used" rather than retried forever. Rotation
   * advancing past that case too is correct, for the same reason. Only the `NO_ELIGIBLE_CONTENT`
   * SKIPPED case (null `contentId`, no item was ever selected) doesn't advance rotation — a due
   * type with no eligible content at all keeps being retried on the next cycle instead of the
   * rotation silently moving past it. Deliberately reads `DeliveryRun` rather than any
   * separately-tracked rotation position, per PLAN.md §5.14's "selection history reads from
   * DeliveryRun" principle.
   */
  private async lastSelectedType(
    client: Prisma.TransactionClient,
    streamId: string,
  ): Promise<ContentType | null> {
    const lastRun = await client.deliveryRun.findFirst({
      where: { streamId, contentId: { not: null } },
      orderBy: { deliveryLocalDate: 'desc' },
      select: { content: { select: { type: true } } },
    });

    return lastRun?.content?.type ?? null;
  }

  /**
   * Strict rotation through `stream.allowedContentTypes`, in array order. The due type is the one
   * after `lastSelectedType` in that array (wrapping); a stream with no prior selection, or whose
   * last-selected type is no longer in `allowedContentTypes`, starts at index 0. If the due
   * type's pool is empty, tries the next type in rotation order (wrapping) before giving up, so a
   * stream still sends most cycles even when one type is temporarily short on approved content —
   * rotation self-heals once that type has content again, since `lastSelectedType` always
   * reflects what was actually chosen, not what was "supposed to" be due.
   */
  private async selectAlternateByType(
    client: Prisma.TransactionClient,
    stream: StreamRecord,
    eligible: SelectableContent[],
    lastSentAtByContentId: Map<string, Date>,
  ): Promise<SelectableContent> {
    const rotation = stream.allowedContentTypes;
    const lastType = await this.lastSelectedType(client, stream.id);
    const lastIndex = lastType === null ? -1 : rotation.indexOf(lastType);
    const dueIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % rotation.length;

    for (let offset = 0; offset < rotation.length; offset++) {
      const candidateType = rotation[(dueIndex + offset) % rotation.length];
      const pool = eligible.filter((item) => item.type === candidateType);

      if (pool.length > 0) {
        if (offset > 0) {
          this.logger.warn({
            event: 'content_selection_rotation_fallback',
            streamId: stream.id,
            dueType: rotation[dueIndex],
            chosenType: candidateType,
          });
        }
        return this.selectLeastRecentlySent(pool, lastSentAtByContentId);
      }
    }

    // Unreachable: `select()` already returned null when `eligible` was empty, and `eligible` is
    // pre-filtered to `type: { in: rotation }`, so at least one type in `rotation` has a non-empty
    // pool by construction.
    throw new Error(
      `ALTERNATE_BY_TYPE: no eligible content found for stream "${stream.id}" despite a non-empty eligible pool.`,
    );
  }

  /** Never-sent content first, then oldest `lastSentAt`, tie-broken by `createdAt ASC`. */
  private selectLeastRecentlySent(
    eligible: SelectableContent[],
    lastSentAtByContentId: Map<string, Date>,
  ): SelectableContent {
    const sorted = [...eligible].sort((a, b) => {
      const aLastSent = lastSentAtByContentId.get(a.id) ?? null;
      const bLastSent = lastSentAtByContentId.get(b.id) ?? null;

      if (aLastSent === null && bLastSent === null) {
        return a.createdAt.getTime() - b.createdAt.getTime();
      }
      if (aLastSent === null) {
        return -1;
      }
      if (bLastSent === null) {
        return 1;
      }

      const diff = aLastSent.getTime() - bLastSent.getTime();
      return diff !== 0 ? diff : a.createdAt.getTime() - b.createdAt.getTime();
    });

    return sorted[0];
  }

  /**
   * Not detailed in PLAN.md §5.14. Picks uniformly at random from content never sent by this
   * stream; once every eligible item has been sent at least once, picks uniformly at random from
   * the full eligible set. This mirrors the LRU algorithm's never-sent/sent-before split but
   * randomizes within each tier instead of ordering by recency.
   */
  private selectRandomWithoutReplacement(
    eligible: SelectableContent[],
    lastSentAtByContentId: Map<string, Date>,
  ): SelectableContent {
    const neverSent = eligible.filter((item) => !lastSentAtByContentId.has(item.id));
    const pool = neverSent.length > 0 ? neverSent : eligible;

    return pool[Math.floor(Math.random() * pool.length)];
  }
}
