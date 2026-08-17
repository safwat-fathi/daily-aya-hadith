import { plainToInstance } from 'class-transformer';
import { ContentType } from '../../generated/prisma/enums';
import { HadithPayloadDto } from '../../content/dto/payloads.dto';
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
  textList,
} from './slack-text';

/**
 * `'ar'` (default) and `'en'` are the only two locales this renderer knows about — anything else
 * in `context.locale` renders as `'ar'`. `version` is `hadith-v2` (bumped from `hadith-v1` when
 * the lessons bullets block was added — a block-structure change, not a wording one), describing
 * the canonical `'ar'` render (README.md "Renderer versions"), which this leaves byte-identical
 * for every field that already existed. `arabicText`/`translation`, `conciseExplanation`/
 * `conciseExplanationTranslation`, and `lessons`/`lessonsTranslation` are the only locale-switched
 * pairs — `en` reads the `*Translation` field, falling back to the Arabic one when absent.
 * `collection`/`book`/`narrator`/`grade`/`grader` have no stored translation and are not
 * localized — they render as stored (typically Arabic) regardless of locale.
 */
const LABELS = {
  ar: {
    header: 'حديث اليوم',
    grade: 'الدرجة',
    translation: 'الترجمة',
    explanation: 'شرح الحديث',
    lessons: 'الدروس المستفادة',
    reflection: 'تأمل',
    practicalAction: 'عمل مقترح',
    hadithNumberPrefix: 'رقم',
  },
  en: {
    header: 'Hadith of the Day',
    grade: 'Grade',
    translation: 'Translation',
    explanation: 'Explanation',
    lessons: 'Lessons',
    reflection: 'Reflection',
    practicalAction: 'Practical Action',
    hadithNumberPrefix: 'no.',
  },
} as const;

type Locale = keyof typeof LABELS;

function localeFor(context: RenderContext): Locale {
  return context.locale === 'en' ? 'en' : 'ar';
}

export class HadithRenderer implements ContentRenderer {
  readonly type = ContentType.HADITH;
  readonly version = 'hadith-v2';

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

    const payload = plainToInstance(HadithPayloadDto, content.payload);
    const arabicText = text(payload.arabicText);
    // `en` leads with the translation, falling back to the Arabic text when no translation is
    // stored (see the "known limitation" in the feature plan — not every item has one yet); `ar`
    // is unchanged from before this locale was added.
    const primaryText = locale === 'en' ? (text(payload.translation) ?? arabicText) : arabicText;

    if (primaryText === undefined) {
      builder.warn(RenderWarning.MISSING_PRIMARY_TEXT);
    }

    builder.section(primaryText);
    builder.context(this.reference(payload, labels));
    builder.labelled(labels.grade, this.grade(payload));
    // For `en`, the translation is already the primary text above, so a separate labelled line
    // would just repeat it.
    if (locale === 'ar') {
      builder.labelled(labels.translation, text(payload.translation));
    }
    const explanationAr = text(payload.conciseExplanation);
    const explanationText =
      locale === 'en'
        ? (text(payload.conciseExplanationTranslation) ?? explanationAr)
        : explanationAr;
    builder.labelled(labels.explanation, explanationText);

    const lessonsAr = textList(payload.lessons);
    const lessonsTranslation = textList(payload.lessonsTranslation);
    const lessonsList =
      locale === 'en' && lessonsTranslation.length > 0 ? lessonsTranslation : lessonsAr;
    builder.bullets(labels.lessons, lessonsList);

    builder.labelled(labels.reflection, text(payload.reflection));
    builder.labelled(labels.practicalAction, text(payload.practicalAction));
    builder.sources(content.sources);
    builder.footer(context.footerText);

    return builder.build(this.version, fallbackText(labels.header, primaryText));
  }

  private reference(
    payload: HadithPayloadDto,
    labels: (typeof LABELS)[Locale],
  ): string | undefined {
    const hadithNumber = text(payload.hadithNumber);
    const citation = joinParts(
      [
        text(payload.collection),
        text(payload.book),
        hadithNumber === undefined ? undefined : `${labels.hadithNumberPrefix} ${hadithNumber}`,
      ],
      '، ',
    );

    return joinParts([text(payload.narrator), citation], ' — ');
  }

  /**
   * PLAN.md §5.5: grading is never invented or inferred by the application. The grade is shown
   * only when one is stored, attributed to the stored grader, and with no wording implying
   * universal scholarly agreement.
   */
  private grade(payload: HadithPayloadDto): string | undefined {
    const grade = text(payload.grade);

    // A grader with no grade would otherwise render as if the person were the grading.
    return grade === undefined ? undefined : joinParts([grade, text(payload.grader)], ' — ');
  }
}
