import { plainToInstance } from 'class-transformer';
import { ContentType } from '../../generated/prisma/enums';
import { BlessingReminderPayloadDto } from '../../content/dto/payloads.dto';
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

const HEADER = 'تذكير بنعم الله';

export class BlessingReminderRenderer implements ContentRenderer {
  readonly type = ContentType.BLESSING_REMINDER;
  readonly version = 'blessing-reminder-v1';

  render(content: RenderableContent, context: RenderContext): RenderedSlackMessage {
    const builder = new SlackMessageBuilder();
    builder.header(HEADER);

    if (!isPlainObject(content.payload)) {
      builder.warn(RenderWarning.PAYLOAD_NOT_OBJECT).warn(RenderWarning.MISSING_PRIMARY_TEXT);
      builder.sources(content.sources).footer(context.footerText);
      return builder.build(this.version, fallbackText(HEADER, undefined));
    }

    const payload = plainToInstance(BlessingReminderPayloadDto, content.payload);
    const body = text(payload.body);

    if (body === undefined) {
      builder.warn(RenderWarning.MISSING_PRIMARY_TEXT);
    }

    builder.section(text(payload.title));
    builder.section(body);
    builder.bullets('أمثلة', textList(payload.examples));
    builder.labelled('تأمل', text(payload.reflection));
    // PLAN.md §5.7 names this field `gratitudeAction`, not `practicalAction` as on other types.
    builder.labelled('عمل الشكر', text(payload.gratitudeAction));
    builder.context(
      joinParts([text(payload.relatedAyahReference), text(payload.relatedHadithReference)], ' · '),
    );
    builder.sources(content.sources);
    builder.footer(context.footerText);

    return builder.build(this.version, fallbackText(HEADER, body));
  }
}
