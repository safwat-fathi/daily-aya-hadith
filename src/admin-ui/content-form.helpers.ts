import { hasText } from '../common/utils/text';
import { formatQuranReference } from '../common/utils/quran-reference';
import { ContentType, SourceType } from '../generated/prisma/enums';

/**
 * HTML forms have no numeric or nested-object types — every field arrives as a string (or a
 * `qs`-parsed nested object of strings). `ContentValidationService.collectDraftOutcome` runs
 * `plainToInstance(PayloadDto, payload)` with no `enableImplicitConversion` and the payload DTOs
 * (e.g. `AyahPayloadDto.surahNumber`) have no `@Type(() => Number)` decorator, so a string
 * `"2"` would fail `@IsInt()` rather than being coerced. Everything below exists to turn raw form
 * strings into the real JS types those DTOs expect, and to drop blank fields/rows rather than
 * storing empty strings — there's no JS-free way to let an operator "add another" row, so a fixed
 * number of rows is always rendered and blanks are filtered out here.
 */

interface RawRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RawRecord)
    : {};
}

export function str(value: unknown): string | undefined {
  return hasText(value) ? value : undefined;
}

function num(value: unknown): number | undefined {
  const text = str(value);
  if (text === undefined) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function strArray(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return items.filter(hasText);
}

function buildWordMeanings(value: unknown): Array<{ word?: string; meaning?: string }> | undefined {
  const rows = Array.isArray(value) ? value : [];
  const cleaned = rows
    .map(asRecord)
    .map((row) => ({ word: str(row.word), meaning: str(row.meaning) }))
    .filter((row) => row.word !== undefined || row.meaning !== undefined);

  return cleaned.length > 0 ? cleaned : undefined;
}

function buildSababAlNuzul(value: unknown): Record<string, unknown> | undefined {
  const row = asRecord(value);
  const summary = str(row.summary);

  if (summary === undefined) {
    return undefined;
  }

  return {
    summary,
    appliesToWholeAyah: row.appliesToWholeAyah !== undefined,
    scholarlyNote: str(row.scholarlyNote),
  };
}

export function buildPayloadFromForm(type: ContentType, raw: unknown): Record<string, unknown> {
  const body = asRecord(raw);

  switch (type) {
    case ContentType.AYAH:
      return {
        arabicText: str(body.arabicText),
        surahNumber: num(body.surahNumber),
        surahNameArabic: str(body.surahNameArabic),
        surahNameEnglish: str(body.surahNameEnglish),
        ayahNumber: num(body.ayahNumber),
        translation: str(body.translation),
        conciseTafsir: str(body.conciseTafsir),
        wordMeanings: buildWordMeanings(body.wordMeanings),
        sababAlNuzul: buildSababAlNuzul(body.sababAlNuzul),
        reflection: str(body.reflection),
        practicalAction: str(body.practicalAction),
      };
    case ContentType.HADITH:
      return {
        arabicText: str(body.arabicText),
        translation: str(body.translation),
        narrator: str(body.narrator),
        collection: str(body.collection),
        book: str(body.book),
        hadithNumber: str(body.hadithNumber),
        grade: str(body.grade),
        grader: str(body.grader),
        conciseExplanation: str(body.conciseExplanation),
        reflection: str(body.reflection),
        practicalAction: str(body.practicalAction),
      };
    case ContentType.COMPANION_STORY:
      return {
        title: str(body.title),
        companionName: str(body.companionName),
        arabicName: str(body.arabicName),
        story: str(body.story),
        historicalContext: str(body.historicalContext),
        lessons: strArray(body.lessons),
        reflection: str(body.reflection),
        practicalAction: str(body.practicalAction),
      };
    case ContentType.BLESSING_REMINDER:
      return {
        title: str(body.title),
        body: str(body.body),
        examples: strArray(body.examples),
        relatedAyahReference: str(body.relatedAyahReference),
        relatedHadithReference: str(body.relatedHadithReference),
        reflection: str(body.reflection),
        gratitudeAction: str(body.gratitudeAction),
      };
    default:
      return {};
  }
}

export interface RawSourceForm {
  sourceType?: string;
  title?: string;
  author?: string;
  publisher?: string;
  edition?: string;
  volume?: string;
  page?: string;
  chapter?: string;
  referenceNumber?: string;
  url?: string;
  notes?: string;
  surahNumber?: number;
  surahNameArabic?: string;
  surahNameEnglish?: string;
  ayahNumber?: number;
}

/**
 * Drops rows with no title — the field that marks a row as "actually filled in" — after QURAN
 * rows have had a title synthesized from their Surah/Ayah fields via `formatQuranReference`
 * (falling back to any stored title so an existing QURAN source with no Surah/Ayah data
 * survives an unrelated edit). A QURAN source is cited by Surah/Ayah, not the generic
 * bibliography fields, so its `title` — required everywhere downstream (DB column, DTO,
 * approval validation, and the literal text `SlackMessageBuilder.citation()` renders into the
 * Slack message) — is derived rather than typed directly.
 */
export function buildSourcesFromForm(raw: unknown): RawSourceForm[] {
  const rows = Array.isArray(raw) ? raw : [];

  return rows
    .map(asRecord)
    .map((row) => {
      const sourceType = str(row.sourceType);
      const isQuran = sourceType === SourceType.QURAN;
      const surahNumber = isQuran ? num(row.surahNumber) : undefined;
      const surahNameArabic = isQuran ? str(row.surahNameArabic) : undefined;
      const surahNameEnglish = isQuran ? str(row.surahNameEnglish) : undefined;
      const ayahNumber = isQuran ? num(row.ayahNumber) : undefined;

      return {
        sourceType,
        title: isQuran
          ? (formatQuranReference({ surahNumber, surahNameArabic, surahNameEnglish, ayahNumber }) ??
            str(row.title))
          : str(row.title),
        author: isQuran ? undefined : str(row.author),
        publisher: isQuran ? undefined : str(row.publisher),
        edition: isQuran ? undefined : str(row.edition),
        volume: isQuran ? undefined : str(row.volume),
        page: isQuran ? undefined : str(row.page),
        chapter: isQuran ? undefined : str(row.chapter),
        referenceNumber: isQuran ? undefined : str(row.referenceNumber),
        url: isQuran ? undefined : str(row.url),
        notes: str(row.notes),
        surahNumber,
        surahNameArabic,
        surahNameEnglish,
        ayahNumber,
      };
    })
    .filter((row) => row.title !== undefined);
}
