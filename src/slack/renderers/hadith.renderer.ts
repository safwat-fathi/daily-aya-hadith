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
} from './slack-text';

const HEADER = 'حديث اليوم';

export class HadithRenderer implements ContentRenderer {
  readonly type = ContentType.HADITH;
  readonly version = 'hadith-v1';

  render(content: RenderableContent, context: RenderContext): RenderedSlackMessage {
    const builder = new SlackMessageBuilder();
    builder.header(HEADER);

    if (!isPlainObject(content.payload)) {
      builder.warn(RenderWarning.PAYLOAD_NOT_OBJECT).warn(RenderWarning.MISSING_PRIMARY_TEXT);
      builder.sources(content.sources).footer(context.footerText);
      return builder.build(this.version, fallbackText(HEADER, undefined));
    }

    const payload = plainToInstance(HadithPayloadDto, content.payload);
    const arabicText = text(payload.arabicText);

    if (arabicText === undefined) {
      builder.warn(RenderWarning.MISSING_PRIMARY_TEXT);
    }

    builder.section(arabicText);
    builder.context(this.reference(payload));
    builder.labelled('الدرجة', this.grade(payload));
    builder.labelled('الترجمة', text(payload.translation));
    builder.labelled('شرح موجز', text(payload.conciseExplanation));
    builder.labelled('تأمل', text(payload.reflection));
    builder.labelled('عمل مقترح', text(payload.practicalAction));
    builder.sources(content.sources);
    builder.footer(context.footerText);

    return builder.build(this.version, fallbackText(HEADER, arabicText));
  }

  private reference(payload: HadithPayloadDto): string | undefined {
    const hadithNumber = text(payload.hadithNumber);
    const citation = joinParts(
      [
        text(payload.collection),
        text(payload.book),
        hadithNumber === undefined ? undefined : `رقم ${hadithNumber}`,
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
