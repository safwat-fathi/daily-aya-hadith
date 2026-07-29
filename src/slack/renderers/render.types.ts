import type { KnownBlock } from '@slack/types';
import type { ContentType, SourceType } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';

export interface RenderContext {
  locale: string;
  footerText?: string;
}

export interface RenderedSlackMessage {
  text: string;
  blocks: KnownBlock[];
  rendererVersion: string;
  warnings: string[];
}

/**
 * Structural subset of a Prisma `ContentSource` row. Declaring what a renderer reads — rather
 * than importing the Prisma row type — keeps renderers usable with any equivalent shape and
 * makes it obvious that no database identity (`id`, timestamps) reaches the rendered message.
 */
export interface RenderableSource {
  sourceType: SourceType;
  title: string;
  author: string | null;
  publisher: string | null;
  edition: string | null;
  volume: string | null;
  page: string | null;
  chapter: string | null;
  referenceNumber: string | null;
  url: string | null;
  notes: string | null;
}

export interface RenderableContent {
  type: ContentType;
  title: string | null;
  locale: string;
  payload: Prisma.JsonValue;
  sources: RenderableSource[];
}

/**
 * One renderer per content type. Renderers are plain classes with no constructor arguments,
 * never Nest providers: that is the structural enforcement of PLAN.md §7.4 "Slack rendering
 * must not query the database" — a renderer has no way to reach Prisma.
 *
 * `type` is a discriminant rather than a `supports()` predicate so the registry in
 * `SlackBlockRenderer` can be closed with `satisfies Record<ContentType, ContentRenderer>`,
 * making a missing renderer a compile error instead of a silent runtime miss.
 */
export interface ContentRenderer {
  readonly type: ContentType;
  readonly version: string;
  render(content: RenderableContent, context: RenderContext): RenderedSlackMessage;
}
