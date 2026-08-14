export interface HadithCollectionName {
  arabic: string;
  english: string;
}

/**
 * The 9 collections hadithapi.com serves (documented at https://hadithapi.com/docs/hadiths).
 * Order here also fixes the import walk order — HadithImportCursor.bookIndex is an index into
 * this array, so reordering it desyncs any already-persisted cursor.
 */
export const BOOK_SLUGS = [
  'sahih-bukhari',
  'sahih-muslim',
  'al-tirmidhi',
  'abu-dawood',
  'ibn-e-majah',
  'sunan-nasai',
  'mishkat',
  'musnad-ahmad',
  'al-silsila-sahiha',
] as const;

export type BookSlug = (typeof BOOK_SLUGS)[number];

/**
 * hadithapi.com's own `status` grade values (verified live — passed as the `status` query
 * param). `Da'eef` is deliberately excluded: PLAN.md 5.5 requires the initial pool to
 * prioritize authentic narrations, so this importer only ever walks Sahih and Hasan. Order here
 * also fixes the import walk order — HadithImportCursor.statusIndex is an index into this array.
 */
export const HADITH_STATUSES = ['Sahih', 'Hasan'] as const;

export type HadithStatus = (typeof HADITH_STATUSES)[number];

export function isHadithStatus(value: string): value is HadithStatus {
  return (HADITH_STATUSES as readonly string[]).includes(value);
}

/**
 * hadithapi.com only returns an English collection name (`book.bookName`) — no Arabic. This
 * table fills that gap so imported content can carry an Arabic `collection` string, matching
 * `HadithRenderer`'s "typically Arabic, unlocalized, shown to both locales" convention. Hand
 * authored from general knowledge, not sourced from the API — same caveat as `SURAH_NAMES`
 * before it, but with no upstream metadata endpoint to verify against here, this table should
 * get a native-speaker/reviewer pass before the imported pool is approved for delivery.
 */
export const HADITH_COLLECTIONS: Record<BookSlug, HadithCollectionName> = {
  'sahih-bukhari': { arabic: 'صحيح البخاري', english: 'Sahih al-Bukhari' },
  'sahih-muslim': { arabic: 'صحيح مسلم', english: 'Sahih Muslim' },
  'al-tirmidhi': { arabic: 'جامع الترمذي', english: 'Jami` at-Tirmidhi' },
  'abu-dawood': { arabic: 'سنن أبي داود', english: 'Sunan Abi Dawud' },
  'ibn-e-majah': { arabic: 'سنن ابن ماجه', english: 'Sunan Ibn Majah' },
  'sunan-nasai': { arabic: 'سنن النسائي', english: "Sunan an-Nasa'i" },
  mishkat: { arabic: 'مشكاة المصابيح', english: 'Mishkat al-Masabih' },
  'musnad-ahmad': { arabic: 'مسند أحمد', english: 'Musnad Ahmad' },
  'al-silsila-sahiha': { arabic: 'السلسلة الصحيحة', english: 'Al-Silsilah as-Sahihah' },
};

/** Maps hadithapi.com's `status` value to the Arabic word stored in `HadithPayloadDto.grade`. */
export const HADITH_GRADE_ARABIC: Record<HadithStatus, string> = {
  Sahih: 'صحيح',
  Hasan: 'حسن',
};

/**
 * hadithapi.com attributes no named muhaddith for its grading — it's the site's own aggregated
 * classification. PLAN.md 5.5 requires the stored grader note to "describe the selected source
 * rather than claiming universal agreement," so this cites the API itself rather than inventing
 * an attribution (e.g. crediting Al-Albani for al-silsila-sahiha) the API never sent.
 */
export const HADITH_GRADER_ATTRIBUTION = 'hadithapi.com';
