import { Injectable, Logger } from '@nestjs/common';
import { ContentService } from '../content/content.service';
import { SURAH_AYAH_COUNTS } from '../content/content-validation.service';
import type { CreateContentDto } from '../content/dto/create-content.dto';
import { hasText } from '../common/utils/text';
import { formatQuranReference } from '../common/utils/quran-reference';
import { ContentStatus, ContentType, SourceType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { clampToPayloadLimit } from './html-text';
import { QuranFoundationClient } from './quran-foundation.client';
import { SURAH_NAMES } from './surah-names';
import { nextVerseAfter, type ImportCursorPosition } from './verse-sequence';

const CURSOR_ID = 'singleton';
const MAX_WORD_MEANINGS = 50;

export interface QuranImportResult {
  created: { contentId: string; surahNumber: number; ayahNumber: number }[];
  skippedDuplicates: { surahNumber: number; ayahNumber: number }[];
  errors: { surahNumber: number; ayahNumber: number; message: string }[];
}

export interface ImportOptions {
  /** `''` means "no translation"; omit the key to use the env-configured default. */
  translationResourceId?: string;
  tafsirResourceId?: string;
  /** Default `true`. The API has no language control for word-by-word glosses (verified live —
   * see `quran-foundation.client.ts`), so this is purely on/off. */
  includeWordMeanings?: boolean;
}

/**
 * Admin-triggered only (`QuranImportController`) — never called from the scheduler or delivery
 * path (PLAN.md §2.1). Pulls the next verses in sequential Mushaf order from Quran.Foundation
 * and creates them as DRAFT `AYAH` `ContentItem`s through the existing review pipeline; nothing
 * here bypasses `ContentService.create()`'s validation or auto-approves anything.
 */
@Injectable()
export class QuranImportService {
  private readonly logger = new Logger(QuranImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: QuranFoundationClient,
    private readonly contentService: ContentService,
  ) {}

  async importNext(
    count: number,
    actorId: string,
    requestId: string,
    options?: ImportOptions,
  ): Promise<QuranImportResult> {
    const result: QuranImportResult = { created: [], skippedDuplicates: [], errors: [] };
    let cursor = await this.loadCursor();

    for (let i = 0; i < count; i += 1) {
      const next = nextVerseAfter(cursor, SURAH_AYAH_COUNTS);

      try {
        if (await this.isAlreadyImported(next.surah, next.ayah)) {
          result.skippedDuplicates.push({ surahNumber: next.surah, ayahNumber: next.ayah });
        } else {
          const contentId = await this.importVerse(
            next.surah,
            next.ayah,
            actorId,
            requestId,
            options,
          );
          result.created.push({ contentId, surahNumber: next.surah, ayahNumber: next.ayah });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown import error';
        this.logger.error(`Failed to import ${next.surah}:${next.ayah}: ${message}`);
        result.errors.push({ surahNumber: next.surah, ayahNumber: next.ayah, message });
      }

      // Advance and persist after every verse, not once at the end of the batch, so a
      // mid-batch failure never causes the next call to re-attempt already-processed verses.
      cursor = { lastSurahNumber: next.surah, lastAyahNumber: next.ayah };
      await this.saveCursor(cursor);
    }

    return result;
  }

  /** Read-only preview of the next verse `importNext` would fetch — no side effects. Mirrors
   * `StreamsService.previewNextContent()`'s dry-run pattern, for the admin UI to show before the
   * operator triggers an import. */
  async peekNext(): Promise<{
    surahNumber: number;
    ayahNumber: number;
    surahNameArabic: string;
    surahNameEnglish: string;
  }> {
    const cursor = await this.loadCursor();
    const next = nextVerseAfter(cursor, SURAH_AYAH_COUNTS);
    const surahName = SURAH_NAMES[next.surah - 1];

    return {
      surahNumber: next.surah,
      ayahNumber: next.ayah,
      surahNameArabic: surahName.arabic,
      surahNameEnglish: surahName.english,
    };
  }

  private async loadCursor(): Promise<ImportCursorPosition> {
    const row = await this.prisma.quranImportCursor.findUnique({ where: { id: CURSOR_ID } });
    return row
      ? { lastSurahNumber: row.lastSurahNumber, lastAyahNumber: row.lastAyahNumber }
      : { lastSurahNumber: 0, lastAyahNumber: 0 };
  }

  private async saveCursor(cursor: ImportCursorPosition): Promise<void> {
    await this.prisma.quranImportCursor.upsert({
      where: { id: CURSOR_ID },
      create: { id: CURSOR_ID, ...cursor },
      update: cursor,
    });
  }

  /** No unique DB constraint ties a ContentItem to a (surah, ayah) pair, so this existence
   * check is what stops the same verse being imported twice — across retries, cursor resets,
   * or a manually-authored draft that happens to already cover this verse. */
  private async isAlreadyImported(surahNumber: number, ayahNumber: number): Promise<boolean> {
    const existing = await this.prisma.contentItem.findFirst({
      where: {
        type: ContentType.AYAH,
        status: { not: ContentStatus.ARCHIVED },
        AND: [
          { payload: { path: ['surahNumber'], equals: surahNumber } },
          { payload: { path: ['ayahNumber'], equals: ayahNumber } },
        ],
      },
      select: { id: true },
    });

    return existing !== null;
  }

  private async importVerse(
    surahNumber: number,
    ayahNumber: number,
    actorId: string,
    requestId: string,
    options?: ImportOptions,
  ): Promise<string> {
    const includeWordMeanings = options?.includeWordMeanings ?? true;
    const verse = await this.client.getVerse(surahNumber, ayahNumber, {
      translationResourceId: options?.translationResourceId,
      tafsirResourceId: options?.tafsirResourceId,
      includeWords: includeWordMeanings,
    });
    const surahName = SURAH_NAMES[surahNumber - 1];

    const wordMeanings = includeWordMeanings
      ? verse.words
          .filter((word) => hasText(word.arabicText) && hasText(word.translation))
          .slice(0, MAX_WORD_MEANINGS)
          .map((word) => ({ word: word.arabicText, meaning: word.translation }))
      : undefined;

    const referenceTitle =
      formatQuranReference({
        surahNumber,
        surahNameArabic: surahName.arabic,
        surahNameEnglish: surahName.english,
        ayahNumber,
      }) ?? `${surahNumber}:${ayahNumber}`;

    const dto: CreateContentDto = {
      type: ContentType.AYAH,
      locale: 'ar',
      title: referenceTitle,
      payload: {
        arabicText: verse.arabicText,
        surahNumber,
        surahNameArabic: surahName.arabic,
        surahNameEnglish: surahName.english,
        ayahNumber,
        translation: clampToPayloadLimit(verse.translation),
        conciseTafsir: clampToPayloadLimit(verse.tafsir),
        wordMeanings,
      },
      sources: [
        {
          sourceType: SourceType.QURAN,
          // Matches the manually-entered-source convention (src/admin-ui/content-form.helpers.ts):
          // title synthesized from the structured surah/ayah fields via the same shared formula
          // AyahRenderer uses for the payload's own citation line, so an imported verse's Slack
          // citation reads identically to a hand-entered one. `url` is kept (unlike the manual
          // form, which blanks it) — the import already has the exact address for free, and
          // SlackMessageBuilder.citation() renders it as a clickable link.
          title: referenceTitle,
          surahNumber,
          surahNameArabic: surahName.arabic,
          surahNameEnglish: surahName.english,
          ayahNumber,
          url: `https://quran.com/${surahNumber}/${ayahNumber}`,
        },
      ],
      createdBy: actorId,
    };

    const content = await this.contentService.create(dto, requestId);
    return content.id;
  }
}
