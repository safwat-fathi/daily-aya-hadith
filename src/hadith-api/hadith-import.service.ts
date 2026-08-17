import { Injectable, Logger } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import { describeContentValidationFailure } from '../content/content.errors';
import type { CreateContentDto } from '../content/dto/create-content.dto';
import { hasText } from '../common/utils/text';
import { ContentStatus, ContentType, SourceType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { HadithApiClient, type HadithApiPage, type RawHadith } from './hadith-api.client';
import {
  BOOK_SLUGS,
  HADITH_COLLECTIONS,
  HADITH_GRADE_ARABIC,
  HADITH_GRADER_ATTRIBUTION,
  HADITH_STATUSES,
  isHadithStatus,
  type BookSlug,
  type HadithStatus,
} from './hadith-collections';
import { nextHadithPosition, type HadithCursorPosition } from './hadith-sequence';

const CURSOR_ID = 'singleton';
// One safety stop past every combo this walk could visit (9 books x 2 statuses) — guards
// against a pathological API response (e.g. a combo that never reports itself exhausted)
// spinning forever within a single importNext() call.
const MAX_EMPTY_COMBO_ADVANCES = BOOK_SLUGS.length * HADITH_STATUSES.length + 1;

export interface HadithImportResult {
  created: { contentId: string; bookSlug: string; hadithNumber: string }[];
  skippedDuplicates: { bookSlug: string; hadithNumber: string }[];
  /** hadithapi.com returned this hadith with no English text — user requirement: only import
   * hadiths that have both Arabic and English. */
  skippedNoEnglish: { bookSlug: string; hadithNumber: string }[];
  errors: { bookSlug: string; hadithNumber?: string; message: string }[];
}

export interface HadithImportPreview {
  bookSlug: BookSlug;
  collectionArabic: string;
  collectionEnglish: string;
  status: HadithStatus;
  page: number;
  itemIndex: number;
}

/**
 * Admin-triggered only (`HadithImportController`) — never called from the scheduler or delivery
 * path (PLAN.md §2.1). Walks hadithapi.com's 9 collections x {Sahih, Hasan} grades x pages, in
 * that priority order, creating `HADITH` `ContentItem`s already `APPROVED` via
 * `ContentService.createApproved()` — gated by the same strict approval-grade validation a human
 * reviewer would apply, but without the manual DRAFT → IN_REVIEW → APPROVED steps.
 */
@Injectable()
export class HadithImportService {
  private readonly logger = new Logger(HadithImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: HadithApiClient,
    private readonly contentService: ContentService,
  ) {}

  async importNext(count: number, actorId: string, requestId: string): Promise<HadithImportResult> {
    const result: HadithImportResult = {
      created: [],
      skippedDuplicates: [],
      skippedNoEnglish: [],
      errors: [],
    };
    let cursor = await this.loadCursor();
    const pageCache = new Map<string, HadithApiPage>();
    let processed = 0;
    let emptyComboAdvances = 0;

    while (processed < count) {
      const bookSlug = BOOK_SLUGS[cursor.bookIndex];
      const status = HADITH_STATUSES[cursor.statusIndex];
      const cacheKey = `${cursor.bookIndex}:${cursor.statusIndex}:${cursor.page}`;

      let page = pageCache.get(cacheKey);
      if (!page) {
        try {
          page = await this.client.getHadithPage(bookSlug, status, cursor.page);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown import error';
          this.logger.error(
            `Failed to fetch ${bookSlug}/${status} page ${cursor.page}: ${message}`,
          );
          result.errors.push({ bookSlug, message });
          // Page-fetch failure: we cannot safely compute the next position without a successful
          // fetch's pagination metadata, so stop the batch WITHOUT advancing/saving the cursor —
          // a retry resumes at exactly this page rather than skipping past a possibly-transient
          // outage or a bad HADITH_API_KEY.
          return result;
        }
        pageCache.set(cacheKey, page);
      }

      if (cursor.itemIndex >= page.data.length) {
        // Empty/404 combo (or a stale itemIndex past the end) — advance without consuming the
        // count budget; `count` means "real hadith candidates considered," not "positions
        // visited."
        emptyComboAdvances += 1;
        if (emptyComboAdvances > MAX_EMPTY_COMBO_ADVANCES) {
          this.logger.error('Hadith import walk exceeded its empty-combo safety cap; stopping.');
          break;
        }
        cursor = nextHadithPosition(cursor, BOOK_SLUGS.length, HADITH_STATUSES.length, {
          dataLength: page.data.length,
          lastPage: page.lastPage,
        });
        await this.saveCursor(cursor);
        continue;
      }

      emptyComboAdvances = 0;
      const row = page.data[cursor.itemIndex];
      processed += 1;

      try {
        // Defense in depth: the `status` query param is confirmed working live, but re-check
        // client-side too, so the PLAN.md §5.5 authenticity requirement never depends solely on
        // a third party's filter behaving as documented.
        const rowStatus = row.status;
        if (!isHadithStatus(rowStatus)) {
          throw new Error(
            `hadithapi.com returned unexpected status "${rowStatus}" for a query filtered to Sahih/Hasan`,
          );
        }

        if (!hasText(row.hadithEnglish)) {
          result.skippedNoEnglish.push({ bookSlug, hadithNumber: row.hadithNumber });
        } else if (await this.isAlreadyImported(bookSlug, row.hadithNumber)) {
          result.skippedDuplicates.push({ bookSlug, hadithNumber: row.hadithNumber });
        } else {
          const contentId = await this.importHadith(row, bookSlug, rowStatus, actorId, requestId);
          result.created.push({ contentId, bookSlug, hadithNumber: row.hadithNumber });
        }
      } catch (error) {
        const message =
          describeContentValidationFailure(error) ??
          (error instanceof Error ? error.message : 'Unknown import error');
        this.logger.error(`Failed to import ${bookSlug} #${row.hadithNumber}: ${message}`);
        result.errors.push({ bookSlug, hadithNumber: row.hadithNumber, message });
      }

      cursor = nextHadithPosition(cursor, BOOK_SLUGS.length, HADITH_STATUSES.length, {
        dataLength: page.data.length,
        lastPage: page.lastPage,
      });
      await this.saveCursor(cursor);
    }

    return result;
  }

  /** Read-only preview of where `importNext` would resume — no network call, mirroring
   * `QuranImportService.peekNext()`'s dry-run pattern. Unlike Quran's preview (a pure function
   * over static data, so it always names an exact verse), this can only describe the CURSOR
   * POSITION, not the hadith actually at it — that combo may turn out to be empty/404 and get
   * silently skipped forward once `importNext` runs. */
  async peekNext(): Promise<HadithImportPreview> {
    const cursor = await this.loadCursor();
    const bookSlug = BOOK_SLUGS[cursor.bookIndex];
    const status = HADITH_STATUSES[cursor.statusIndex];
    const collection = HADITH_COLLECTIONS[bookSlug];

    return {
      bookSlug,
      collectionArabic: collection.arabic,
      collectionEnglish: collection.english,
      status,
      page: cursor.page,
      itemIndex: cursor.itemIndex,
    };
  }

  private async loadCursor(): Promise<HadithCursorPosition> {
    const row = await this.prisma.hadithImportCursor.findUnique({ where: { id: CURSOR_ID } });
    return row
      ? {
          bookIndex: row.bookIndex,
          statusIndex: row.statusIndex,
          page: row.page,
          itemIndex: row.itemIndex,
        }
      : { bookIndex: 0, statusIndex: 0, page: 1, itemIndex: 0 };
  }

  private async saveCursor(cursor: HadithCursorPosition): Promise<void> {
    await this.prisma.hadithImportCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, ...cursor },
      update: cursor,
    });
  }

  /** No unique DB constraint ties a ContentItem to a (collection, hadithNumber) pair, so this
   * existence check is what stops the same hadith being imported twice — across retries, cursor
   * resets, or a walk that has wrapped back to book 0. `collection` is deterministic per
   * `bookSlug` via `HADITH_COLLECTIONS`, so the pair is a stable identifier as long as that
   * table doesn't change — mirrors `QuranImportService.isAlreadyImported()`. */
  private async isAlreadyImported(bookSlug: BookSlug, hadithNumber: string): Promise<boolean> {
    const collection = HADITH_COLLECTIONS[bookSlug].arabic;
    const existing = await this.prisma.contentItem.findFirst({
      where: {
        type: ContentType.HADITH,
        status: { not: ContentStatus.ARCHIVED },
        AND: [
          { payload: { path: ['collection'], equals: collection } },
          { payload: { path: ['hadithNumber'], equals: hadithNumber } },
        ],
      },
      select: { id: true },
    });

    return existing !== null;
  }

  private async importHadith(
    row: RawHadith,
    bookSlug: BookSlug,
    status: HadithStatus,
    actorId: string,
    requestId: string,
  ): Promise<string> {
    const collectionNames = HADITH_COLLECTIONS[bookSlug];
    const chapterArabic = row.chapter?.chapterArabic;
    const bookArabic = hasText(chapterArabic) ? chapterArabic : undefined;
    const grade = HADITH_GRADE_ARABIC[status];

    const referenceTitle = [
      collectionNames.arabic,
      bookArabic,
      hasText(row.hadithNumber) ? `رقم ${row.hadithNumber}` : undefined,
    ]
      .filter(hasText)
      .join('، ');

    const dto: CreateContentDto = {
      type: ContentType.HADITH,
      locale: 'ar',
      title: referenceTitle,
      payload: {
        arabicText: row.hadithArabic ?? undefined,
        translation: row.hadithEnglish ?? undefined,
        collection: collectionNames.arabic,
        book: bookArabic,
        hadithNumber: row.hadithNumber,
        grade,
        grader: HADITH_GRADER_ATTRIBUTION,
      },
      sources: [
        {
          sourceType: SourceType.HADITH_COLLECTION,
          title: referenceTitle,
          volume: row.volume === undefined || row.volume === null ? undefined : String(row.volume),
          referenceNumber: row.hadithNumber,
        },
      ],
      createdBy: actorId,
    };

    const content = await this.contentService.createApproved(dto, requestId);
    return content.id;
  }
}
