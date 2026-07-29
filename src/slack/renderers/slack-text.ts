import type { ContextBlock, HeaderBlock, KnownBlock, SectionBlock } from '@slack/types';
import { hasText } from '../../common/utils/text';
import type { RenderableSource, RenderedSlackMessage } from './render.types';

/** Slack's own hard limits. Exceeding any of these makes Slack reject the message. */
export const SECTION_TEXT_LIMIT = 3000;
export const HEADER_TEXT_LIMIT = 150;
export const MAX_BLOCKS = 50;

/** PLAN.md §5.23 "approximately 3,000 visible characters when practical". Advisory only. */
export const SOFT_MESSAGE_BUDGET = 3000;

/**
 * Warning codes carry a stable machine-readable prefix so the Phase 4 send path can refuse to
 * post on `limit.*` by prefix, rather than by matching human prose that may be reworded.
 */
export const RenderWarning = {
  BLOCK_COUNT: 'limit.block_count',
  SECTION_SPLIT: 'limit.section_split',
  SOFT_BUDGET: 'limit.soft_budget',
  MISSING_PRIMARY_TEXT: 'render.missing_primary_text',
  NO_SOURCES: 'render.no_sources',
  PAYLOAD_NOT_OBJECT: 'render.payload_not_object',
  URL_NOT_LINKABLE: 'render.url_not_linkable',
} as const;

/**
 * Slack requires exactly three characters to be escaped, and Arabic script contains none of
 * them — letters, harakat, the ornate parentheses, the end-of-ayah mark and Arabic punctuation
 * all pass through byte-identical, and Slack renders the entities back to the original glyphs.
 *
 * That is what lets PLAN.md §13.2 (escape special characters) and §25.15 (preserve exact stored
 * Quran and hadith text) both hold. Nothing else may be done to stored text here: no entity
 * library, no percent-encoding, no Unicode normalization, no trimming, no truncation.
 * The ampersand must be replaced first or the other two replacements would be double-escaped.
 */
export function escapeSlackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Payload fields are read out of a Prisma `Json` column, so their runtime type is whatever was
 * stored — a row written before a DTO change can hold a number where a string is declared.
 * Every field a renderer reads goes through here or {@link textList}.
 */
export function text(value: unknown): string | undefined {
  return hasText(value) ? value : undefined;
}

export function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(hasText) : [];
}

export function numberText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

/** Joins the parts that are present with `separator`, or returns undefined when none are. */
export function joinParts(parts: (string | undefined)[], separator: string): string | undefined {
  const present = parts.filter(hasText);
  return present.length > 0 ? present.join(separator) : undefined;
}

function entitySafeCut(value: string, cut: number): number {
  // Never land inside an escape sequence such as `&amp;` — an entity holds no whitespace, so
  // only the grapheme fallback can produce such a cut.
  const lookBehind = value.slice(Math.max(0, cut - 5), cut);
  const ampersand = lookBehind.lastIndexOf('&');

  if (ampersand === -1 || lookBehind.includes(';', ampersand)) {
    return cut;
  }

  return Math.max(0, cut - 5) + ampersand;
}

function graphemeCut(value: string, limit: number): number {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let cut = 0;

  for (const { index, segment } of segmenter.segment(value)) {
    if (index + segment.length > limit) {
      break;
    }
    cut = index + segment.length;
  }

  return cut > 0 ? cut : limit;
}

function findBreakpoint(window: string): number {
  const paragraph = window.lastIndexOf('\n\n');
  if (paragraph > 0) {
    return paragraph + 2;
  }

  const line = window.lastIndexOf('\n');
  if (line > 0) {
    return line + 1;
  }

  const sentences = [...window.matchAll(/[.!?؟۔](\s)/gu)];
  const lastSentence = sentences.at(-1);
  if (lastSentence?.index !== undefined && lastSentence.index > 0) {
    return lastSentence.index + lastSentence[0].length;
  }

  const space = window.lastIndexOf(' ');
  if (space > 0) {
    return space + 1;
  }

  return entitySafeCut(window, graphemeCut(window, window.length));
}

/**
 * Splits already-escaped text into pieces that each fit `limit`, preferring paragraph, then
 * line, then sentence, then word boundaries. **No character is dropped** — concatenating the
 * result reproduces the input exactly — which is what keeps "never silently truncate Quran or
 * hadith text" true. Callers must emit a `limit.section_split` warning when more than one piece
 * comes back, so the split is never silent either.
 */
export function splitEscapedText(value: string, limit = SECTION_TEXT_LIMIT): string[] {
  if (value.length <= limit) {
    return [value];
  }

  const chunks: string[] = [];
  let rest = value;

  while (rest.length > limit) {
    const cut = findBreakpoint(rest.slice(0, limit));
    const safeCut = cut > 0 ? cut : limit;
    chunks.push(rest.slice(0, safeCut));
    rest = rest.slice(safeCut);
  }

  if (rest.length > 0) {
    chunks.push(rest);
  }

  return chunks;
}

/** PLAN.md §13.2: no clickable links for missing or untrusted URLs. */
export function isLinkableUrl(value: string): boolean {
  if (/[<>|]/.test(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function headerBlock(value: string): HeaderBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text: value.slice(0, HEADER_TEXT_LIMIT), emoji: false },
  };
}

function sectionBlock(value: string): SectionBlock {
  return { type: 'section', text: { type: 'mrkdwn', text: value } };
}

function contextBlock(value: string): ContextBlock {
  return { type: 'context', elements: [{ type: 'mrkdwn', text: value }] };
}

/**
 * Assembles one Slack message. Every renderer builds through this so escaping, splitting,
 * limit warnings and the "skip empty sections" rule are implemented exactly once.
 */
export class SlackMessageBuilder {
  private readonly blocks: KnownBlock[] = [];
  private readonly warnings: string[] = [];
  private visibleLength = 0;

  header(value: string): this {
    this.blocks.push(headerBlock(value));
    this.visibleLength += value.length;
    return this;
  }

  /**
   * Emits stored text as its own section with no surrounding mrkdwn markers, so a literal `*`
   * or `_` inside the stored text cannot change how the rest of the message renders.
   */
  section(value: string | undefined): this {
    if (!hasText(value)) {
      return this;
    }

    const chunks = splitEscapedText(escapeSlackText(value));
    if (chunks.length > 1) {
      this.warn(RenderWarning.SECTION_SPLIT);
    }

    for (const chunk of chunks) {
      this.blocks.push(sectionBlock(chunk));
    }

    this.visibleLength += value.length;
    return this;
  }

  /** A label the application authors, then the stored value on its own line. */
  labelled(label: string, value: string | undefined): this {
    if (!hasText(value)) {
      return this;
    }

    const chunks = splitEscapedText(escapeSlackText(value), SECTION_TEXT_LIMIT - label.length - 4);
    if (chunks.length > 1) {
      this.warn(RenderWarning.SECTION_SPLIT);
    }

    this.blocks.push(sectionBlock(`*${escapeSlackText(label)}*\n${chunks[0]}`));
    for (const chunk of chunks.slice(1)) {
      this.blocks.push(sectionBlock(chunk));
    }

    this.visibleLength += label.length + value.length;
    return this;
  }

  bullets(label: string, items: string[]): this {
    if (items.length === 0) {
      return this;
    }

    const body = items.map((item) => `• ${escapeSlackText(item)}`).join('\n');
    const chunks = splitEscapedText(body, SECTION_TEXT_LIMIT - label.length - 4);
    if (chunks.length > 1) {
      this.warn(RenderWarning.SECTION_SPLIT);
    }

    this.blocks.push(sectionBlock(`*${escapeSlackText(label)}*\n${chunks[0]}`));
    for (const chunk of chunks.slice(1)) {
      this.blocks.push(sectionBlock(chunk));
    }

    this.visibleLength += label.length + body.length;
    return this;
  }

  context(value: string | undefined): this {
    if (!hasText(value)) {
      return this;
    }

    for (const chunk of splitEscapedText(escapeSlackText(value))) {
      this.blocks.push(contextBlock(chunk));
    }

    this.visibleLength += value.length;
    return this;
  }

  /** Pre-escaped context line, for citations that embed `<url|label>` link syntax. */
  private rawContext(value: string): this {
    for (const chunk of splitEscapedText(value)) {
      this.blocks.push(contextBlock(chunk));
    }

    this.visibleLength += value.length;
    return this;
  }

  sources(sources: RenderableSource[]): this {
    if (sources.length === 0) {
      this.warn(RenderWarning.NO_SOURCES);
      return this;
    }

    const citations = sources.map((source) => this.citation(source));
    return this.rawContext(citations.join(' · '));
  }

  private citation(source: RenderableSource): string {
    const label = joinParts(
      [
        text(source.title),
        text(source.author),
        joinParts([text(source.volume), text(source.page)], '/'),
        hasText(source.referenceNumber) ? `رقم ${source.referenceNumber}` : undefined,
      ],
      '، ',
    );
    const escaped = escapeSlackText(label ?? source.title);

    if (!hasText(source.url)) {
      return escaped;
    }

    // A `|` in the label would terminate Slack's link syntax early; rather than mutate the
    // citation text, fall back to plain text and say so.
    if (!isLinkableUrl(source.url) || escaped.includes('|')) {
      this.warn(RenderWarning.URL_NOT_LINKABLE);
      return escaped;
    }

    return `<${source.url}|${escaped}>`;
  }

  footer(footerText: string | undefined): this {
    return this.context(footerText);
  }

  warn(code: string): this {
    if (!this.warnings.includes(code)) {
      this.warnings.push(code);
    }
    return this;
  }

  build(rendererVersion: string, fallback: string): RenderedSlackMessage {
    const warnings = [...this.warnings];
    let blocks = this.blocks;

    if (blocks.length > MAX_BLOCKS) {
      blocks = blocks.slice(0, MAX_BLOCKS);
      warnings.push(RenderWarning.BLOCK_COUNT);
    }

    if (this.visibleLength > SOFT_MESSAGE_BUDGET) {
      warnings.push(RenderWarning.SOFT_BUDGET);
    }

    return { text: fallback, blocks, rendererVersion, warnings };
  }
}

/**
 * Notification fallback: the category header plus the primary stored text, escaped identically
 * to the blocks and never truncated (Slack truncates the notification itself). Falls back to the
 * header alone so `text` is never empty, which drafts with no body would otherwise produce.
 */
export function fallbackText(header: string, primary: string | undefined): string {
  return hasText(primary) ? `${header}\n${escapeSlackText(primary)}` : header;
}
