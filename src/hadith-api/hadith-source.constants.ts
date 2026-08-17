/**
 * HadeethEnc (hadeethenc.com) attributes no named muhaddith for its own site-level grading beyond
 * each hadith's own `grade` field — there is no per-book "collection" concept the way
 * hadithapi.com had (its `book` slugs). This constant names the encyclopedia itself as both the
 * `collection` and `grader` a reader sees, directly mirroring the deleted hadithapi.com importer's
 * `HADITH_GRADER_ATTRIBUTION` rationale: cite the source actually queried rather than inventing an
 * attribution it never sent. Verified live (site `<title>`/`og:site_name`): "موسوعة الأحاديث
 * النبوية".
 */
export const HADEETH_ENC_ATTRIBUTION = 'موسوعة الأحاديث النبوية';

/**
 * Defensive denylist (not an allowlist) implementing PLAN.md §5.5's "weak or disputed narrations
 * should not be included in the default approved pool" as defense in depth against HadeethEnc's
 * own `grade` field being wrong or absent — mirrors this codebase's existing philosophy (the
 * deleted hadithapi.com importer's `isHadithStatus` re-validated the API's own status filter
 * client-side even though the server was trusted). An allowlist was deliberately rejected: a live
 * sample of 38 hadiths already showed unpredictable "authentic" phrasing (e.g. "صحيح دون ذكر
 * السنين") an allowlist would wrongly reject; a small denylist of unambiguously-weak markers is
 * safer to keep short and correct.
 */
const WEAK_GRADE_MARKERS = ['ضعيف', 'موضوع', 'منكر', 'باطل'] as const;

/**
 * A missing/blank grade is not treated as weak — PLAN.md §5.5 targets narrations *known* to be
 * weak or disputed, not narrations HadeethEnc simply didn't grade. `HadithPayloadDto.grade` is
 * optional and the renderer already omits an absent grade line gracefully.
 */
export function isWeakGrade(gradeArabic: string | undefined): boolean {
  return (
    gradeArabic !== undefined && WEAK_GRADE_MARKERS.some((marker) => gradeArabic.includes(marker))
  );
}
