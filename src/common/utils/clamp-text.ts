import { LONG_TEXT_MAX_LENGTH } from '../../content/dto/payloads.dto';

const TRUNCATION_MARKER = ' […truncated — edit before approving]';

/**
 * Strips HTML markup and collapses the resulting whitespace. Payload text is rendered through
 * Slack's own escaping (`SlackMessageBuilder.escapeSlackText`), not HTML, so markup left in would
 * either blow `MaxLength` on long entries or render as raw escaped tags in Slack.
 *
 * Quran.Foundation translation text carries footnote markers as `<sup foot_note=95>1</sup>` —
 * confirmed live against 1:1 ("...the Entirely Merciful, the Especially Merciful.<sup
 * foot_note=227141>2</sup>"). Those are removed whole (tag *and* footnote digit), not just
 * unwrapped, or the digit is left stranded mid-sentence (e.g. "Lord 1 of the worlds").
 */
export function stripHtml(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const stripped = value
    .replace(/<sup\b[^>]*>.*?<\/sup>/gis, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return stripped.length > 0 ? stripped : undefined;
}

/**
 * Strips HTML, then clamps to `LONG_TEXT_MAX_LENGTH` so an oversized value never fails
 * `ContentService.create()`'s validation outright. Necessary in practice, not just in theory:
 * fetched live against Quran.Foundation, Ibn Kathir's tafsir for 1:1 alone strips down to
 * ~51,000 characters — 5x the field's 10,000-character cap, because the API bundles surah-level
 * introductory commentary into the first ayah's tafsir entry. A truncated import is a starting
 * point for the human reviewer to shorten, not a final "concise" tafsir/explanation.
 */
export function clampToPayloadLimit(value: string | undefined): string | undefined {
  const stripped = stripHtml(value);

  if (stripped === undefined || stripped.length <= LONG_TEXT_MAX_LENGTH) {
    return stripped;
  }

  const cutoff = LONG_TEXT_MAX_LENGTH - TRUNCATION_MARKER.length;
  return `${stripped.slice(0, cutoff)}${TRUNCATION_MARKER}`;
}
