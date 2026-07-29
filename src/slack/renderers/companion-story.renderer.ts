import { plainToInstance } from 'class-transformer';
import { ContentType } from '../../generated/prisma/enums';
import { CompanionStoryPayloadDto } from '../../content/dto/payloads.dto';
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

const HEADER = 'موقف من حياة الصحابة';

export class CompanionStoryRenderer implements ContentRenderer {
  readonly type = ContentType.COMPANION_STORY;
  readonly version = 'companion-story-v1';

  render(content: RenderableContent, context: RenderContext): RenderedSlackMessage {
    const builder = new SlackMessageBuilder();
    builder.header(HEADER);

    if (!isPlainObject(content.payload)) {
      builder.warn(RenderWarning.PAYLOAD_NOT_OBJECT).warn(RenderWarning.MISSING_PRIMARY_TEXT);
      builder.sources(content.sources).footer(context.footerText);
      return builder.build(this.version, fallbackText(HEADER, undefined));
    }

    const payload = plainToInstance(CompanionStoryPayloadDto, content.payload);
    const story = text(payload.story);

    if (story === undefined) {
      builder.warn(RenderWarning.MISSING_PRIMARY_TEXT);
    }

    builder.section(text(payload.title));
    builder.context(joinParts([text(payload.companionName), text(payload.arabicName)], ' — '));
    builder.section(story);
    builder.labelled('السياق التاريخي', text(payload.historicalContext));
    builder.bullets('الدروس', textList(payload.lessons));
    builder.labelled('تأمل', text(payload.reflection));
    builder.labelled('عمل مقترح', text(payload.practicalAction));
    builder.sources(content.sources);
    builder.footer(context.footerText);

    return builder.build(this.version, fallbackText(HEADER, story));
  }
}
