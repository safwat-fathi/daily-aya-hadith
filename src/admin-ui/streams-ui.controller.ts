import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequestId } from '../common/decorators/request-id.decorator';
import { ContentType, ScheduleFrequency, SelectionStrategy } from '../generated/prisma/enums';
import { CreateStreamDto, ListStreamsQueryDto, UpdateStreamDto } from '../streams/dto/stream.dto';
import { StreamsService } from '../streams/streams.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AdminUiSessionGuard } from './admin-ui-session.guard';
import { ADMIN_UI_ACTOR } from './constants';
import { str } from './content-form.helpers';
import { validateFormDto } from './dto-form';
import { extractErrorMessage, readFlash, setFlash } from './flash';

const BASE = '/api/v1/admin/streams';

/** Repeated same-name checkboxes parse to a string when exactly one is checked, else an array. */
function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

@Public()
@UseGuards(AdminUiSessionGuard)
@Controller('admin/streams')
export class StreamsUiController {
  constructor(
    private readonly streamsService: StreamsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Get()
  async list(
    @Query() query: ListStreamsQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.streamsService.list(query);

    response.render('streams/list', {
      title: 'Streams',
      activeNav: 'streams',
      flash: readFlash(request),
      items: result.items,
      pagination: result.pagination,
      basePath: `${BASE}?`,
    });
  }

  @Get('new')
  async showNew(@Req() request: Request, @Res() response: Response): Promise<void> {
    const workspaces = await this.workspacesService.list({ page: 1, limit: 100 });

    response.render('streams/form', {
      title: 'New stream',
      activeNav: 'streams',
      flash: readFlash(request),
      mode: 'create',
      stream: null,
      workspaces: workspaces.items,
      frequencies: Object.values(ScheduleFrequency),
      contentTypes: Object.values(ContentType),
      selectionStrategies: Object.values(SelectionStrategy),
    });
  }

  @Post()
  async create(
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;

    const validation = await validateFormDto(CreateStreamDto, {
      workspaceId: str(body.workspaceId),
      name: str(body.name),
      isEnabled: body.isEnabled !== undefined,
      frequency: str(body.frequency),
      sendTime: str(body.sendTime),
      timezone: str(body.timezone),
      daysOfWeek: toArray(body.daysOfWeek).map(Number),
      locale: str(body.locale) ?? 'ar',
      allowedContentTypes: toArray(body.allowedContentTypes),
      selectionStrategy: str(body.selectionStrategy),
      maxAutomaticAttempts: body.maxAutomaticAttempts
        ? Number(body.maxAutomaticAttempts)
        : undefined,
      actorId: ADMIN_UI_ACTOR,
    });

    if (!validation.ok) {
      setFlash(request, 'error', validation.message);
      response.redirect(`${BASE}/new`);
      return;
    }

    try {
      const stream = await this.streamsService.create(validation.dto, requestId);
      setFlash(request, 'success', 'Stream created.');
      response.redirect(`${BASE}/${stream.id}`);
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
      response.redirect(`${BASE}/new`);
    }
  }

  @Get(':id')
  async detail(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const stream = await this.streamsService.getById(id);
    const workspaces = await this.workspacesService.list({ page: 1, limit: 100 });
    const nextContent = await this.streamsService.previewNextContent(id).catch(() => null);

    response.render('streams/form', {
      title: stream.name,
      activeNav: 'streams',
      flash: readFlash(request),
      mode: 'edit',
      stream,
      workspaces: workspaces.items,
      frequencies: Object.values(ScheduleFrequency),
      contentTypes: Object.values(ContentType),
      selectionStrategies: Object.values(SelectionStrategy),
      nextContent,
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

    const validation = await validateFormDto(UpdateStreamDto, {
      name: str(body.name),
      frequency: str(body.frequency),
      sendTime: str(body.sendTime),
      timezone: str(body.timezone),
      daysOfWeek: toArray(body.daysOfWeek).map(Number),
      locale: str(body.locale),
      allowedContentTypes: toArray(body.allowedContentTypes),
      selectionStrategy: str(body.selectionStrategy),
      maxAutomaticAttempts: body.maxAutomaticAttempts
        ? Number(body.maxAutomaticAttempts)
        : undefined,
      actorId: ADMIN_UI_ACTOR,
    });

    if (!validation.ok) {
      setFlash(request, 'error', validation.message);
      response.redirect(`${BASE}/${id}`);
      return;
    }

    try {
      await this.streamsService.update(id, validation.dto, requestId);
      setFlash(request, 'success', 'Stream updated.');
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
    }

    response.redirect(`${BASE}/${id}`);
  }

  @Post(':id/enable')
  async enable(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    try {
      await this.streamsService.setEnabled(id, { actorId: ADMIN_UI_ACTOR }, true, requestId);
      setFlash(request, 'success', 'Stream enabled.');
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
    }
    response.redirect(`${BASE}/${id}`);
  }

  @Post(':id/disable')
  async disable(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    try {
      await this.streamsService.setEnabled(id, { actorId: ADMIN_UI_ACTOR }, false, requestId);
      setFlash(request, 'success', 'Stream disabled.');
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
    }
    response.redirect(`${BASE}/${id}`);
  }
}
