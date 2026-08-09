import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequestId } from '../common/decorators/request-id.decorator';
import { ContentPreviewService } from '../content/content-preview.service';
import { ContentService } from '../content/content.service';
import { ListContentQueryDto } from '../content/dto/content-query.dto';
import { CreateContentDto } from '../content/dto/create-content.dto';
import {
  ActorActionDto,
  RejectContentDto,
  ReviewDecisionDto,
} from '../content/dto/review-action.dto';
import { UpdateContentDto } from '../content/dto/update-content.dto';
import { ContentStatus, ContentType, SourceType } from '../generated/prisma/enums';
import { ReviewService } from '../review/review.service';
import { AdminUiSessionGuard } from './admin-ui-session.guard';
import { ADMIN_UI_ACTOR } from './constants';
import { buildPayloadFromForm, buildSourcesFromForm, str } from './content-form.helpers';
import { validateFormDto } from './dto-form';
import { extractErrorMessage, readFlash, setFlash } from './flash';

const BASE = '/api/v1/admin/content';

/** Runs a simple status-transition action, flashing success/failure, then redirects. */
async function runAction(
  request: Request,
  response: Response,
  redirectTo: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
    setFlash(request, 'success', 'Done.');
  } catch (error) {
    setFlash(request, 'error', extractErrorMessage(error));
  }
  response.redirect(redirectTo);
}

@Public()
@UseGuards(AdminUiSessionGuard)
@Controller('admin/content')
export class ContentUiController {
  constructor(
    private readonly contentService: ContentService,
    private readonly previewService: ContentPreviewService,
    private readonly reviewService: ReviewService,
  ) {}

  @Get()
  async list(
    @Query() query: ListContentQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.contentService.list(query);
    const params = new URLSearchParams();
    if (query.type) params.set('type', query.type);
    if (query.status) params.set('status', query.status);
    if (query.locale) params.set('locale', query.locale);
    if (query.search) params.set('search', query.search);
    if (query.sort) params.set('sort', query.sort);
    const queryPrefix = params.toString().length > 0 ? `${params.toString()}&` : '';

    response.render('content/list', {
      title: 'Content',
      activeNav: 'content',
      flash: readFlash(request),
      items: result.items,
      pagination: result.pagination,
      basePath: `${BASE}?${queryPrefix}`,
      query,
      contentTypes: Object.values(ContentType),
      contentStatuses: Object.values(ContentStatus),
    });
  }

  @Get('new')
  showNew(
    @Query('type') type: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    const selectedType = Object.values(ContentType).includes(type as ContentType)
      ? (type as ContentType)
      : undefined;

    response.render('content/new', {
      title: 'New content',
      activeNav: 'content',
      flash: readFlash(request),
      contentTypes: Object.values(ContentType),
      selectedType,
      payload: {},
      locale: 'ar',
      contentTitle: '',
      sources: [],
      sourceTypes: Object.values(SourceType),
    });
  }

  @Post()
  async create(
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;
    const type = body.type as ContentType;
    const payload = buildPayloadFromForm(type, body.payload);
    const sources = buildSourcesFromForm(body.sources);

    const validation = await validateFormDto(CreateContentDto, {
      type,
      locale: str(body.locale) ?? 'ar',
      title: str(body.title),
      payload,
      sources,
      createdBy: ADMIN_UI_ACTOR,
    });

    if (!validation.ok) {
      setFlash(request, 'error', validation.message);
      response.redirect(`${BASE}/new?type=${encodeURIComponent(type ?? '')}`);
      return;
    }

    try {
      const content = await this.contentService.create(validation.dto, requestId);
      setFlash(request, 'success', 'Draft created.');
      response.redirect(`${BASE}/${content.id}`);
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
      response.redirect(`${BASE}/new?type=${encodeURIComponent(type ?? '')}`);
    }
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.contentService.getById(id);
    const deliveries = await this.contentService.deliveryHistory(id, { page: 1, limit: 10 });
    const approvalIssues = await this.previewService
      .preview(id)
      .then((result) => result.approvalIssues)
      .catch(() => []);

    response.render('content/detail', {
      title: content.title ?? content.type,
      activeNav: 'content',
      flash: readFlash(request),
      content,
      deliveries: deliveries.items,
      approvalIssues,
      sourceTypes: Object.values(SourceType),
      editable: content.status === ContentStatus.DRAFT || content.status === ContentStatus.REJECTED,
    });
  }

  @Post(':id/edit')
  async edit(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;
    const existing = await this.contentService.getById(id);
    const payload = buildPayloadFromForm(existing.type, body.payload);
    const sources = buildSourcesFromForm(body.sources);

    const validation = await validateFormDto(UpdateContentDto, {
      locale: str(body.locale) ?? existing.locale,
      title: str(body.title),
      payload,
      sources,
      expectedUpdatedAt: str(body.expectedUpdatedAt) ?? existing.updatedAt.toISOString(),
      updatedBy: ADMIN_UI_ACTOR,
    });

    if (!validation.ok) {
      setFlash(request, 'error', validation.message);
      response.redirect(`${BASE}/${id}`);
      return;
    }

    try {
      await this.contentService.update(id, validation.dto, requestId);
      setFlash(request, 'success', 'Content updated.');
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
    }

    response.redirect(`${BASE}/${id}`);
  }

  @Post(':id/submit-review')
  async submitReview(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    await runAction(request, response, `${BASE}/${id}`, () =>
      this.reviewService.submit(id, { actorId: ADMIN_UI_ACTOR } satisfies ActorActionDto, requestId),
    );
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;
    await runAction(request, response, `${BASE}/${id}`, () =>
      this.reviewService.approve(
        id,
        { reviewerId: ADMIN_UI_ACTOR, reviewNote: str(body.reviewNote) } satisfies ReviewDecisionDto,
        requestId,
      ),
    );
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;
    const reviewNote = str(body.reviewNote);

    if (reviewNote === undefined) {
      setFlash(request, 'error', 'A reviewer note is required to reject content.');
      response.redirect(`${BASE}/${id}`);
      return;
    }

    await runAction(request, response, `${BASE}/${id}`, () =>
      this.reviewService.reject(
        id,
        { reviewerId: ADMIN_UI_ACTOR, reviewNote } satisfies RejectContentDto,
        requestId,
      ),
    );
  }

  @Post(':id/archive')
  async archive(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    await runAction(request, response, `${BASE}/${id}`, () =>
      this.contentService.archive(id, { actorId: ADMIN_UI_ACTOR } satisfies ActorActionDto, requestId),
    );
  }

  @Post(':id/revise')
  async revise(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    try {
      const revision = await this.contentService.revise(
        id,
        { actorId: ADMIN_UI_ACTOR } satisfies ActorActionDto,
        requestId,
      );
      setFlash(request, 'success', `Created revision (version ${revision.version}).`);
      response.redirect(`${BASE}/${revision.id}`);
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
      response.redirect(`${BASE}/${id}`);
    }
  }

  @Get(':id/preview')
  async preview(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.previewService.preview(id);

    response.render('content/preview', {
      title: `Preview: ${result.type}`,
      activeNav: 'content',
      flash: readFlash(request),
      result,
      contentId: id,
    });
  }
}
