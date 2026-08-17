import { Injectable, Logger } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import { describeContentValidationFailure } from '../content/content.errors';
import type { CreateContentDto } from '../content/dto/create-content.dto';
import { hasText } from '../common/utils/text';
import { clampToPayloadLimit } from '../common/utils/clamp-text';
import { ContentStatus, ContentType, SourceType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  HadithApiClient,
  type HadeethListPage,
  type RawCategoryNode,
  type RawHadeethDetail,
} from './hadith-api.client';
import {
  flattenCategoryIds,
  nextHadeethCategoryPosition,
  type HadeethCategoryPosition,
} from './hadith-category-walk';
import { HADEETH_ENC_ATTRIBUTION, isWeakGrade } from './hadith-source.constants';

const CURSOR_ID = 'singleton';
// Matches HadithPayloadDto.lessons/.lessonsTranslation's @ArrayMaxSize(20) — kept as a separate
// literal here rather than shared, same pattern as quran-import.service.ts's MAX_WORD_MEANINGS.
const MAX_LESSONS = 20;

export interface HadithImportResult {
  created: { contentId: string; categoryId: string; hadithId: string }[];
  skippedDuplicates: { categoryId: string; hadithId: string }[];
  /** HadeethEnc's list response didn't claim English support for this hadith, or claimed it but
   * the fetched English text turned out blank — user requirement: only import hadiths that have
   * both Arabic and English. */
  skippedNoEnglish: { categoryId: string; hadithId: string }[];
  /** PLAN.md §5.5: weak/disputed narrations are excluded from the default approved pool — see
   * `isWeakGrade()`. */
  skippedWeakGrade: { categoryId: string; hadithId: string; grade: string }[];
  errors: { categoryId: string; hadithId?: string; message: string }[];
}

export interface HadithImportPreview {
  categoryId: string;
  categoryTitleArabic: string;
  categoryTitleEnglish: string;
  page: number;
  itemIndex: number;
}

type HadithClassification = 'no-english' | 'duplicate' | 'needs-detail';

interface PageAnalysis {
  classification: Map<string, HadithClassification>;
  arDetails: Map<string, RawHadeethDetail>;
  enDetails: Map<string, RawHadeethDetail>;
}

interface CachedPage {
  page: HadeethListPage;
  analysis: PageAnalysis;
}

/**
 * Admin-triggered only (`HadithImportController`) — never called from the scheduler or delivery
 * path (PLAN.md §2.1). Walks HadeethEnc's full category tree (every category id with hadiths,
 * leaf and non-leaf alike — see `hadith-category-walk.ts`), creating `HADITH` `ContentItem`s
 * already `APPROVED` via `ContentService.createApproved()` — gated by the same strict
 * approval-grade validation a human reviewer would apply, but without the manual
 * DRAFT → IN_REVIEW → APPROVED steps.
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
      skippedWeakGrade: [],
      errors: [],
    };

    // One tree fetch per call, not per category boundary — cheap (one unpaginated request) and
    // keeps the walk correct against upstream reordering, since the cursor stores a category id,
    // not a position within this array (see hadith-category-walk.ts).
    const categoryIds = flattenCategoryIds(await this.client.getCategoryTree('ar'));
    // One past every category id this walk could visit — guards against a pathological response
    // (e.g. a category that never reports itself exhausted) spinning forever within one call.
    const cap = categoryIds.length + 1;

    let cursor = await this.loadCursor();
    // '' means "nothing imported yet" — resolve it to the first real id before the loop below
    // ever tries to fetch a page with it. nextHadeethCategoryPosition() only handles this
    // sentinel when computing the position AFTER an item is processed; the very first iteration
    // needs it resolved up front.
    if (cursor.categoryId === '') {
      cursor = { categoryId: categoryIds[0] ?? '', page: 1, itemIndex: 0 };
    }
    const pageCache = new Map<string, CachedPage>();
    let processed = 0;
    let emptyAdvances = 0;

    while (processed < count) {
      const pageCacheKey = `${cursor.categoryId}:${cursor.page}`;
      let cached = pageCache.get(pageCacheKey);

      if (!cached) {
        let page: HadeethListPage;
        try {
          page = await this.client.getHadeethsPage(cursor.categoryId, cursor.page);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown import error';
          this.logger.error(
            `Failed to fetch category ${cursor.categoryId} page ${cursor.page}: ${message}`,
          );
          result.errors.push({ categoryId: cursor.categoryId, message });
          // Page-fetch failure: we cannot safely compute the next position without a successful
          // fetch's pagination metadata, so stop the batch WITHOUT advancing/saving the cursor —
          // a retry resumes at exactly this page rather than skipping past a possibly-transient
          // outage.
          return result;
        }
        cached = { page, analysis: await this.analyzePage(page, cursor.itemIndex) };
        pageCache.set(pageCacheKey, cached);
      }

      const { page, analysis } = cached;

      if (cursor.itemIndex >= page.data.length) {
        // Empty page (or a stale itemIndex past the end) — advance without consuming the count
        // budget; `count` means "real hadith candidates considered," not "positions visited."
        emptyAdvances += 1;
        if (emptyAdvances > cap) {
          this.logger.error('Hadith import walk exceeded its empty-category safety cap; stopping.');
          break;
        }
        cursor = nextHadeethCategoryPosition(cursor, categoryIds, {
          dataLength: page.data.length,
          lastPage: page.lastPage,
        });
        await this.saveCursor(cursor);
        continue;
      }

      emptyAdvances = 0;
      const row = page.data[cursor.itemIndex];
      processed += 1;

      try {
        const classification = analysis.classification.get(row.id);

        if (classification === 'no-english') {
          result.skippedNoEnglish.push({ categoryId: cursor.categoryId, hadithId: row.id });
        } else if (classification === 'duplicate') {
          result.skippedDuplicates.push({ categoryId: cursor.categoryId, hadithId: row.id });
        } else {
          const arDetail = analysis.arDetails.get(row.id);
          const enDetail = analysis.enDetails.get(row.id);

          if (!arDetail || !enDetail) {
            result.errors.push({
              categoryId: cursor.categoryId,
              hadithId: row.id,
              message: `HadeethEnc did not return hadith ${row.id} for one of the requested languages`,
            });
          } else if (!hasText(enDetail.hadeeth)) {
            // The list response's `translations` array is a claim of availability, not a
            // guarantee of non-blank text — re-check now that the real fetch is in hand.
            result.skippedNoEnglish.push({ categoryId: cursor.categoryId, hadithId: row.id });
          } else if (isWeakGrade(arDetail.grade)) {
            result.skippedWeakGrade.push({
              categoryId: cursor.categoryId,
              hadithId: row.id,
              grade: arDetail.grade ?? '',
            });
          } else {
            const contentId = await this.importHadith(
              row.id,
              arDetail,
              enDetail,
              actorId,
              requestId,
            );
            result.created.push({ contentId, categoryId: cursor.categoryId, hadithId: row.id });
          }
        }
      } catch (error) {
        const message =
          describeContentValidationFailure(error) ??
          (error instanceof Error ? error.message : 'Unknown import error');
        this.logger.error(
          `Failed to import hadith ${row.id} (category ${cursor.categoryId}): ${message}`,
        );
        result.errors.push({ categoryId: cursor.categoryId, hadithId: row.id, message });
      }

      cursor = nextHadeethCategoryPosition(cursor, categoryIds, {
        dataLength: page.data.length,
        lastPage: page.lastPage,
      });
      await this.saveCursor(cursor);
    }

    return result;
  }

  /** Read-only preview of where `importNext` would resume, mirroring
   * `QuranImportService.peekNext()`'s dry-run pattern. Unlike the deleted hadithapi.com version,
   * this makes two network calls (the category tree in `ar` and `en`, for the admin preview's
   * bilingual title) rather than none — a deliberate change: this is a low-frequency
   * admin-page-load action, not the hot import path, so the extra cost buys UI parity. Like the
   * version it replaces, this can only describe the CURSOR POSITION, not the hadith actually at
   * it — that combo may turn out to be empty and get silently skipped forward once `importNext`
   * runs. */
  async peekNext(): Promise<HadithImportPreview> {
    const cursor = await this.loadCursor();
    const [treeAr, treeEn] = await Promise.all([
      this.client.getCategoryTree('ar'),
      this.client.getCategoryTree('en'),
    ]);
    const categoryIds = flattenCategoryIds(treeAr);
    const categoryId = cursor.categoryId === '' ? (categoryIds[0] ?? '') : cursor.categoryId;
    const titleFor = (tree: RawCategoryNode[]): string =>
      tree.find((node) => node.id === categoryId)?.title ?? categoryId;

    return {
      categoryId,
      categoryTitleArabic: titleFor(treeAr),
      categoryTitleEnglish: titleFor(treeEn),
      page: cursor.page,
      itemIndex: cursor.itemIndex,
    };
  }

  /** One pass over the rest of the page (from `fromIndex` — earlier items were already handled by
   * a prior call within this same `importNext()` run, so re-scanning them would be wasted work),
   * classifying every row by the two cheap checks (English availability claim, then local-DB
   * dedup) and batch-fetching full detail — one `hadeeths/multiple` call per language — for only
   * the ids that need it. Trade-off, named explicitly: this dedup-checks the entire remainder of
   * the page, not just the next `count - processed` items, so a small `count` on a page with many
   * un-imported candidates still pays for classifying all of them; bounded worst case is one page
   * (≤100 items) of local DB queries folded into the same 2 external calls either way. */
  private async analyzePage(page: HadeethListPage, fromIndex: number): Promise<PageAnalysis> {
    const classification = new Map<string, HadithClassification>();
    const idsNeedingDetail: string[] = [];

    for (let i = fromIndex; i < page.data.length; i += 1) {
      const row = page.data[i];

      if (!row.translations.includes('en')) {
        classification.set(row.id, 'no-english');
        continue;
      }

      if (await this.isAlreadyImported(row.id)) {
        classification.set(row.id, 'duplicate');
        continue;
      }

      classification.set(row.id, 'needs-detail');
      idsNeedingDetail.push(row.id);
    }

    const [arDetails, enDetails] = await Promise.all([
      this.client.getHadeethsMultiple(idsNeedingDetail, 'ar'),
      this.client.getHadeethsMultiple(idsNeedingDetail, 'en'),
    ]);

    return { classification, arDetails, enDetails };
  }

  private async loadCursor(): Promise<HadeethCategoryPosition> {
    const row = await this.prisma.hadithImportCursor.findUnique({ where: { id: CURSOR_ID } });
    return row
      ? { categoryId: row.categoryId, page: row.page, itemIndex: row.itemIndex }
      : { categoryId: '', page: 1, itemIndex: 0 };
  }

  private async saveCursor(cursor: HadeethCategoryPosition): Promise<void> {
    await this.prisma.hadithImportCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, ...cursor },
      update: cursor,
    });
  }

  /** No unique DB constraint ties a ContentItem to a HadeethEnc id, so this existence check is
   * what stops the same hadith being imported twice. Critically important here, not just defense
   * in depth: a hadith can be tagged into multiple categories (verified live), and this walk
   * visits every category, so the same hadith is re-encountered under different categoryIds as a
   * matter of course. Scoped to `payload.grader = HADEETH_ENC_ATTRIBUTION` so this can never
   * collide with a legacy hadithapi.com-imported row (different grader value, non-overlapping id
   * numbering) — mirrors `QuranImportService.isAlreadyImported()`. */
  private async isAlreadyImported(hadithId: string): Promise<boolean> {
    const existing = await this.prisma.contentItem.findFirst({
      where: {
        type: ContentType.HADITH,
        status: { not: ContentStatus.ARCHIVED },
        AND: [
          { payload: { path: ['grader'], equals: HADEETH_ENC_ATTRIBUTION } },
          { payload: { path: ['hadithNumber'], equals: hadithId } },
        ],
      },
      select: { id: true },
    });

    return existing !== null;
  }

  private async importHadith(
    hadithId: string,
    ar: RawHadeethDetail,
    en: RawHadeethDetail,
    actorId: string,
    requestId: string,
  ): Promise<string> {
    const referenceTitle = [HADEETH_ENC_ATTRIBUTION, ar.attribution, `رقم ${hadithId}`]
      .filter(hasText)
      .join('، ');

    const lessonsAr = (ar.hints ?? []).slice(0, MAX_LESSONS);
    // English hints were observed live with trailing \r (Arabic ones don't have this) — this is
    // commentary cleanup, not narration text, so PLAN.md §13.2's byte-identical guarantee (which
    // covers arabicText/translation only) doesn't apply.
    const lessonsEn = (en.hints ?? []).map((hint) => hint.replace(/\r$/, '')).slice(0, MAX_LESSONS);
    if ((ar.hints?.length ?? 0) > MAX_LESSONS || (en.hints?.length ?? 0) > MAX_LESSONS) {
      this.logger.warn(`Hadith ${hadithId} has more than ${MAX_LESSONS} hints; truncating.`);
    }

    const dto: CreateContentDto = {
      type: ContentType.HADITH,
      locale: 'ar',
      title: referenceTitle,
      payload: {
        arabicText: ar.hadeeth,
        translation: en.hadeeth,
        collection: HADEETH_ENC_ATTRIBUTION,
        book: ar.attribution,
        hadithNumber: hadithId,
        grade: ar.grade,
        grader: HADEETH_ENC_ATTRIBUTION,
        conciseExplanation: clampToPayloadLimit(ar.explanation),
        conciseExplanationTranslation: clampToPayloadLimit(en.explanation),
        lessons: lessonsAr.length > 0 ? lessonsAr : undefined,
        lessonsTranslation: lessonsEn.length > 0 ? lessonsEn : undefined,
      },
      sources: [
        {
          sourceType: SourceType.HADITH_COLLECTION,
          title: HADEETH_ENC_ATTRIBUTION,
          referenceNumber: hadithId,
          notes: ar.reference,
        },
      ],
      createdBy: actorId,
    };

    const content = await this.contentService.createApproved(dto, requestId);
    return content.id;
  }
}
