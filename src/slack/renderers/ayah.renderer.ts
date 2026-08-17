import { plainToInstance } from 'class-transformer';
import { ContentType } from '../../generated/prisma/enums';
import { AyahPayloadDto } from '../../content/dto/payloads.dto';
import { formatQuranReference } from '../../common/utils/quran-reference';
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
  text,
} from './slack-text';

/**
 * `'ar'` (default) and `'en'` are the only two locales this renderer knows about — anything else
 * in `context.locale` renders as `'ar'`. `version` below is `ayah-v2`: bumped from `ayah-v1` when
 * a Basmala block was added to the sequence (README.md "Renderer versions" — bump only on block
 * structure changes, never for wording). One version string still covers both locale variants,
 * as before — a future structural change to the `'en'` layout alone would still need its own bump.
 */
const LABELS = {
  ar: {
    header: 'آية اليوم',
    translation: 'الترجمة',
    tafsir: 'تفسير موجز',
    wordMeanings: 'معاني الكلمات',
    sababAlNuzul: 'سبب النزول',
    reflection: 'تأمل',
    practicalAction: 'عمل مقترح',
    appliesToWholeAyah: 'يتعلق بالآية كاملة.',
    appliesToPartOfAyah: 'يتعلق بجزء من الآية.',
  },
  en: {
    header: 'Verse of the Day',
    translation: 'Translation',
    tafsir: 'Concise Tafsir',
    wordMeanings: 'Word Meanings',
    sababAlNuzul: 'Reason for Revelation',
    reflection: 'Reflection',
    practicalAction: 'Practical Action',
    appliesToWholeAyah: 'Applies to the whole ayah.',
    appliesToPartOfAyah: 'Applies to part of the ayah.',
  },
} as const;

type Locale = keyof typeof LABELS;

/** The recited opening formula. Rendered per `showsBasmala()`, identical in both locales — the
 * citation line (`reference()` below) already hardcodes Arabic "سورة"/"آية" for both locales the
 * same way. */
const BASMALA_TEXT = 'بسم الله الرحمن الرحيم';

function localeFor(context: RenderContext): Locale {
  return context.locale === 'en' ? 'en' : 'ar';
}

/** Same guard as `numberText`, but keeps the value numeric for `formatQuranReference`. */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class AyahRenderer implements ContentRenderer {
  readonly type = ContentType.AYAH;
  readonly version = 'ayah-v2';

  render(content: RenderableContent, context: RenderContext): RenderedSlackMessage {
    const locale = localeFor(context);
    const labels = LABELS[locale];
    const builder = new SlackMessageBuilder();
    builder.header(labels.header);

    if (!isPlainObject(content.payload)) {
      builder.warn(RenderWarning.PAYLOAD_NOT_OBJECT).warn(RenderWarning.MISSING_PRIMARY_TEXT);
      builder.sources(content.sources).footer(context.footerText);
      return builder.build(this.version, fallbackText(labels.header, undefined));
    }

    // `plainToInstance` gives named fields and applies the nested `@Type()` transforms, but it
    // does not validate: a row written before a DTO change can still hold anything, so every
    // field below is read through the defensive accessors.
    const payload = plainToInstance(AyahPayloadDto, content.payload);
    const arabicText = text(payload.arabicText);
    // `en` leads with the translation, falling back to the Arabic text when no translation is
    // stored (see the "known limitation" in the feature plan — not every item has one yet); `ar`
    // is unchanged from before this locale was added.
    const primaryText = locale === 'en' ? (text(payload.translation) ?? arabicText) : arabicText;

    if (primaryText === undefined) {
      builder.warn(RenderWarning.MISSING_PRIMARY_TEXT);
    }

    builder.section(this.showsBasmala(payload) ? BASMALA_TEXT : undefined);
    builder.section(primaryText);
    builder.context(this.reference(payload));
    // For `en`, the translation is already the primary text above, so a separate labelled line
    // would just repeat it.
    if (locale === 'ar') {
      builder.labelled(labels.translation, text(payload.translation));
    }

    const tafsirResourceName = text(payload.tafsirResourceName);
    const tafsirLabel = tafsirResourceName
      ? `${labels.tafsir} (${tafsirResourceName})`
      : labels.tafsir;
    builder.labelled(tafsirLabel, text(payload.conciseTafsir));

    if (locale !== 'ar') {
      builder.bullets(labels.wordMeanings, this.wordMeanings(payload));
    }

    builder.labelled(labels.sababAlNuzul, this.sababAlNuzul(payload, labels));
    builder.labelled(labels.reflection, text(payload.reflection));
    builder.labelled(labels.practicalAction, text(payload.practicalAction));
    builder.sources(content.sources);
    builder.footer(context.footerText);

    return builder.build(this.version, fallbackText(labels.header, primaryText));
  }

  /** Every surah opens with the Basmala except At-Tawbah (9). Al-Fatihah's ayah 1 *is* the
   * Basmala verse itself, so a separate line there would duplicate it. */
  private showsBasmala(payload: AyahPayloadDto): boolean {
    const surahNumber = finiteNumber(payload.surahNumber);
    const ayahNumber = finiteNumber(payload.ayahNumber);
    return ayahNumber === 1 && surahNumber !== undefined && surahNumber !== 1 && surahNumber !== 9;
  }

  private reference(payload: AyahPayloadDto): string | undefined {
    return formatQuranReference({
      surahNumber: finiteNumber(payload.surahNumber),
      surahNameArabic: text(payload.surahNameArabic),
      surahNameEnglish: text(payload.surahNameEnglish),
      ayahNumber: finiteNumber(payload.ayahNumber),
    });
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
  private sababAlNuzul(
    payload: AyahPayloadDto,
    labels: (typeof LABELS)[Locale],
  ): string | undefined {
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
        ? labels.appliesToWholeAyah
        : sabab.appliesToWholeAyah === false
          ? labels.appliesToPartOfAyah
          : undefined;

    return joinParts([summary, scope, text(sabab.scholarlyNote)], '\n');
  }
}
