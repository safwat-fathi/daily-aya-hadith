import { Injectable } from '@nestjs/common';
import { ContentType } from '../generated/prisma/enums';
import { AyahRenderer } from './renderers/ayah.renderer';
import { BlessingReminderRenderer } from './renderers/blessing-reminder.renderer';
import { CompanionStoryRenderer } from './renderers/companion-story.renderer';
import { HadithRenderer } from './renderers/hadith.renderer';
import type {
  ContentRenderer,
  RenderContext,
  RenderableContent,
  RenderedSlackMessage,
} from './renderers/render.types';

/**
 * Dispatches to the renderer for a content type.
 *
 * The registry is closed with `satisfies Record<ContentType, ContentRenderer>` — mirroring
 * `PAYLOAD_DTO_BY_TYPE` in the content module — so adding a content type without a renderer is
 * a compile error rather than a runtime miss. This is the only injectable piece of rendering;
 * the renderers themselves take no constructor arguments and cannot reach the database.
 */
@Injectable()
export class SlackBlockRenderer {
  private readonly renderers = {
    [ContentType.AYAH]: new AyahRenderer(),
    [ContentType.HADITH]: new HadithRenderer(),
    [ContentType.COMPANION_STORY]: new CompanionStoryRenderer(),
    [ContentType.BLESSING_REMINDER]: new BlessingReminderRenderer(),
  } satisfies Record<ContentType, ContentRenderer>;

  render(content: RenderableContent, context: RenderContext): RenderedSlackMessage {
    return this.renderers[content.type].render(content, context);
  }

  versionFor(type: ContentType): string {
    return this.renderers[type].version;
  }
}
