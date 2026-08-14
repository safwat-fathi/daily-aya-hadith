import { Injectable } from '@nestjs/common';
import { ContentStatus, ContentType, SelectionStrategy } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { StreamRecord } from '../streams/streams.service';

export type SelectableContent = Prisma.ContentItemGetPayload<{
  include: { sources: true };
}>;

/**
 * PLAN.md §5.14. Runs inside `DeliveryOrchestratorService.reserveRun`'s `Serializable`
 * transaction when selecting content for a new cycle, and read-only (against the base
 * `PrismaService`, no transaction) for the `GET /streams/:id/next-content` dry run.
 */
@Injectable()
export class ContentSelectionService {
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
