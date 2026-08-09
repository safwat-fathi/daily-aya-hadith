export interface QuranReferenceParts {
  surahNumber?: number;
  surahNameArabic?: string;
  surahNameEnglish?: string;
  ayahNumber?: number;
}

/**
 * Formats a Surah/Ayah citation as `سورة {arabic} — آية {n} (english)`, e.g.
 * `سورة الفاتحة — آية 3 (Al-Fatihah)`. Both the surah and ayah parts are individually optional
 * and joined only if present; `undefined` when neither is available.
 *
 * The single source of truth for this formula — previously duplicated between
 * `AyahRenderer.reference()` (an AYAH payload's own citation line) and `quranSourceTitle()` in
 * `src/admin-ui/content-form.helpers.ts` (a manually-entered QURAN `ContentSource`'s synthesized
 * title). `src/quran-foundation/quran-import.service.ts` is the third caller, so an imported
 * verse's citation reads identically to a hand-entered one.
 */
export function formatQuranReference(parts: QuranReferenceParts): string | undefined {
  const surahName =
    parts.surahNameArabic ??
    (parts.surahNumber === undefined ? undefined : String(parts.surahNumber));
  const surah = surahName === undefined ? undefined : `سورة ${surahName}`;
  const ayah = parts.ayahNumber === undefined ? undefined : `آية ${parts.ayahNumber}`;
  const joined = [surah, ayah].filter((part): part is string => part !== undefined);

  if (joined.length === 0) {
    return undefined;
  }

  const reference = joined.join(' — ');
  return parts.surahNameEnglish === undefined
    ? reference
    : `${reference} (${parts.surahNameEnglish})`;
}
