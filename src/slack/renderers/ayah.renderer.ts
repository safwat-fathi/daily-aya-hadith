import { plainToInstance } from 'class-transformer';
import { ContentType } from '../../generated/prisma/enums';
import { AyahPayloadDto } from '../../content/dto/payloads.dto';
import type {
  ContentRenderer,
  RenderContext,
  RenderableContent,
  RenderedSlackMessage,
} from './render.types';
import {
  RenderWarning,
  SlackMessageBuilder,
  fallbackText,
  isPlainObject,
  joinParts,
  numberText,
  text,
} from './slack-text';

const HEADER = 'آية اليوم';

export class AyahRenderer implements ContentRenderer {
  readonly type = ContentType.AYAH;
  readonly version = 'ayah-v1';

  render(content: RenderableContent, context: RenderContext): RenderedSlackMessage {
    const builder = new SlackMessageBuilder();
    builder.header(HEADER);

    if (!isPlainObject(content.payload)) {
      builder.warn(RenderWarning.PAYLOAD_NOT_OBJECT).warn(RenderWarning.MISSING_PRIMARY_TEXT);
      builder.sources(content.sources).footer(context.footerText);
      return builder.build(this.version, fallbackText(HEADER, undefined));
    }

    // `plainToInstance` gives named fields and applies the nested `@Type()` transforms, but it
    // does not validate: a row written before a DTO change can still hold anything, so every
    // field below is read through the defensive accessors.
    const payload = plainToInstance(AyahPayloadDto, content.payload);
    const arabicText = text(payload.arabicText);

    if (arabicText === undefined) {
      builder.warn(RenderWarning.MISSING_PRIMARY_TEXT);
    }

    builder.section(arabicText);
    builder.context(this.reference(payload));
    builder.labelled('الترجمة', text(payload.translation));
    builder.labelled('تفسير موجز', text(payload.conciseTafsir));
    builder.bullets('معاني الكلمات', this.wordMeanings(payload));
    builder.labelled('سبب النزول', this.sababAlNuzul(payload));
    builder.labelled('تأمل', text(payload.reflection));
    builder.labelled('عمل مقترح', text(payload.practicalAction));
    builder.sources(content.sources);
    builder.footer(context.footerText);

    return builder.build(this.version, fallbackText(HEADER, arabicText));
  }

  private reference(payload: AyahPayloadDto): string | undefined {
    const surahName = text(payload.surahNameArabic) ?? numberText(payload.surahNumber);
    const surah = surahName === undefined ? undefined : `سورة ${surahName}`;
    const ayahNumber = numberText(payload.ayahNumber);
    const ayah = ayahNumber === undefined ? undefined : `آية ${ayahNumber}`;
    const reference = joinParts([surah, ayah], ' — ');
    const english = text(payload.surahNameEnglish);

    if (reference === undefined) {
      return undefined;
    }

    return english === undefined ? reference : `${reference} (${english})`;
  }

  private wordMeanings(payload: AyahPayloadDto): string[] {
    if (!Array.isArray(payload.wordMeanings)) {
      return [];
    }

    return payload.wordMeanings.flatMap((entry) => {
      if (!isPlainObject(entry)) {
        return [];
      }

      const word = text(entry.word);
      const meaning = text(entry.meaning);

      // PLAN.md §5.4: word meanings exist to benefit the reader; half an entry does not.
      return word !== undefined && meaning !== undefined ? [`${word} — ${meaning}`] : [];
    });
  }

  /**
   * Rendered only when a summary is actually stored, and the scope qualifier only when the
   * stored boolean says so. PLAN.md §5.4 forbids presenting general thematic context as a
   * definite occasion of revelation, so an absent `appliesToWholeAyah` adds no claim at all.
   */
  private sababAlNuzul(payload: AyahPayloadDto): string | undefined {
    const sabab: unknown = payload.sababAlNuzul;

    if (!isPlainObject(sabab)) {
      return undefined;
    }

    const summary = text(sabab.summary);

    if (summary === undefined) {
      return undefined;
    }

    const scope =
      sabab.appliesToWholeAyah === true
        ? 'يتعلق بالآية كاملة.'
        : sabab.appliesToWholeAyah === false
          ? 'يتعلق بجزء من الآية.'
          : undefined;

    return joinParts([summary, scope, text(sabab.scholarlyNote)], '\n');
  }
}
