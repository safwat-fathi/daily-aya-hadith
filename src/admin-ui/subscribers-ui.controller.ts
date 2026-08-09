import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequestId } from '../common/decorators/request-id.decorator';
import {
  CreateSubscriberDto,
  ListSubscribersQueryDto,
  UpdateSubscriberDto,
} from '../subscribers/dto/subscriber.dto';
import { SubscribersService } from '../subscribers/subscribers.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AdminUiSessionGuard } from './admin-ui-session.guard';
import { ADMIN_UI_ACTOR } from './constants';
import { str } from './content-form.helpers';
import { validateFormDto } from './dto-form';
import { extractErrorMessage, readFlash, setFlash } from './flash';

const BASE = '/api/v1/admin/subscribers';

@Public()
@UseGuards(AdminUiSessionGuard)
@Controller('admin/subscribers')
export class SubscribersUiController {
  constructor(
    private readonly subscribersService: SubscribersService,
    // Read-only: the subscribers UI only needs a workspace picker for the create form.
    // Workspace CRUD screens themselves are out of scope for this dashboard.
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Get()
  async list(
    @Query() query: ListSubscribersQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.subscribersService.list(query);

    response.render('subscribers/list', {
      title: 'Subscribers',
      activeNav: 'subscribers',
      flash: readFlash(request),
      items: result.items,
      pagination: result.pagination,
      basePath: `${BASE}?`,
    });
  }

  @Get('new')
  async showNew(@Req() request: Request, @Res() response: Response): Promise<void> {
    const workspaces = await this.workspacesService.list({ page: 1, limit: 100 });

    response.render('subscribers/form', {
      title: 'New subscriber',
      activeNav: 'subscribers',
      flash: readFlash(request),
      mode: 'create',
      subscriber: null,
      workspaces: workspaces.items,
    });
  }

  @Post()
  async create(
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;

    const validation = await validateFormDto(CreateSubscriberDto, {
      workspaceId: str(body.workspaceId),
      slackUserId: str(body.slackUserId),
      timezone: str(body.timezone) ?? 'Africa/Cairo',
      locale: str(body.locale) ?? 'ar',
      isActive: body.isActive !== undefined,
      actorId: ADMIN_UI_ACTOR,
    });

    if (!validation.ok) {
      setFlash(request, 'error', validation.message);
      response.redirect(`${BASE}/new`);
      return;
    }

    try {
      const subscriber = await this.subscribersService.create(validation.dto, requestId);
      setFlash(request, 'success', 'Subscriber created.');
      response.redirect(`${BASE}/${subscriber.id}`);
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
    const subscriber = await this.subscribersService.getById(id);

    response.render('subscribers/form', {
      title: subscriber.slackUserId,
      activeNav: 'subscribers',
      flash: readFlash(request),
      mode: 'edit',
      subscriber,
      workspaces: [],
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

    const validation = await validateFormDto(UpdateSubscriberDto, {
      timezone: str(body.timezone),
      locale: str(body.locale),
      isActive: body.isActive !== undefined,
      actorId: ADMIN_UI_ACTOR,
    });

    if (!validation.ok) {
      setFlash(request, 'error', validation.message);
      response.redirect(`${BASE}/${id}`);
      return;
    }

    try {
      await this.subscribersService.update(id, validation.dto, requestId);
      setFlash(request, 'success', 'Subscriber updated.');
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
    }

    response.redirect(`${BASE}/${id}`);
  }
}
