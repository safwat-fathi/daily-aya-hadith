import { Injectable } from '@nestjs/common';
import type { KnownBlock } from '@slack/types';
import type { ValidationErrorDetail } from '../common/utils/validation-errors';
import type { ContentStatus, ContentType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { RenderContext } from '../slack/renderers/render.types';
import { SlackBlockRenderer } from '../slack/slack-block.renderer';
import { ContentValidationService } from './content-validation.service';
import { ContentService } from './content.service';

export interface ContentPreviewResult {
  contentId: string;
  type: ContentType;
  status: ContentStatus;
  rendererVersion: string;
  text: string;
  blocks: KnownBlock[];
  /** How the message will render — long sections split, missing text, unlinkable URLs. */
  warnings: string[];
  /** What would block approval. Empty for content that is already approvable. */
  approvalIssues: ValidationErrorDetail[];
}

/**
 * Renders a content item exactly as it would be posted, without posting anything and without
 * creating a delivery record (PLAN.md §5.16).
 *
 * This service reads the database and hands plain data to the renderer, which keeps §7.4's
 * "Slack rendering must not query the database" intact: the renderers themselves have no
 * database access. Preview must succeed for content in any status, so nothing here throws for
 * incomplete content — problems come back as `warnings` and `approvalIssues`.
 */
@Injectable()
export class ContentPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: ContentService,
    private readonly validationService: ContentValidationService,
    private readonly blockRenderer: SlackBlockRenderer,
  ) {}

  async preview(id: string, subscriberId?: string): Promise<ContentPreviewResult> {
    const content = await this.contentService.getById(id);
    const context = await this.renderContext(content.locale, subscriberId);
    const approvalIssues = await this.validationService.collectApprovalIssues(content);
    const rendered = this.blockRenderer.render(content, context);

    return {
      contentId: content.id,
      type: content.type,
      status: content.status,
      rendererVersion: rendered.rendererVersion,
      text: rendered.text,
      blocks: rendered.blocks,
      warnings: rendered.warnings,
      approvalIssues,
    };
  }

  /**
   * With a subscriber the preview renders in the locale that person will actually receive. An
   * unknown subscriber id is ignored rather than rejected: preview is a diagnostic, and the
   * content still renders correctly with default context.
   *
   * There is no footer to apply — the per-user DM model dropped `footerText` along with channel
   * subscriptions, since a direct message has no channel-level branding to carry.
   */
  private async renderContext(locale: string, subscriberId?: string): Promise<RenderContext> {
    if (subscriberId === undefined) {
      return { locale };
    }

    const subscriber = await this.prisma.userSubscriber.findUnique({
      where: { id: subscriberId },
      select: { locale: true },
    });

    return { locale: subscriber?.locale ?? locale };
  }
}
