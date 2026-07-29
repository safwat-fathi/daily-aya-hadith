import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RequestId } from '../common/decorators/request-id.decorator';
import type { PaginatedResponse } from '../common/dto/pagination.dto';
import { ContentPreviewService, type ContentPreviewResult } from './content-preview.service';
import type { ContentDetail, ContentSummary } from './content.select';
import { ContentService } from './content.service';
import { ContentPreviewResponseDto } from './dto/content-preview-response.dto';
import { ContentDetailResponseDto, ContentSummaryResponseDto } from './dto/content-response.dto';
import { CreateContentDto } from './dto/create-content.dto';
import {
  ContentIdParamDto,
  ContentPreviewQueryDto,
  DeliveryHistoryQueryDto,
  ListContentQueryDto,
} from './dto/content-query.dto';
import { ActorActionDto } from './dto/review-action.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@ApiTags('Content')
@ApiSecurity('admin-key')
@Controller('content')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly previewService: ContentPreviewService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a draft content item' })
  @ApiCreatedResponse({ type: ContentDetailResponseDto })
  create(@Body() dto: CreateContentDto, @RequestId() requestId: string): Promise<ContentDetail> {
    return this.contentService.create(dto, requestId);
  }

  @Get()
  @ApiOperation({ summary: 'List content with filtering, search, sorting, and pagination' })
  @ApiOkResponse({ type: ContentSummaryResponseDto, isArray: true })
  list(@Query() query: ListContentQueryDto): Promise<PaginatedResponse<ContentSummary>> {
    return this.contentService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get content with sources and revision history' })
  @ApiOkResponse({ type: ContentDetailResponseDto })
  getById(@Param() params: ContentIdParamDto): Promise<ContentDetail> {
    return this.contentService.getById(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a draft or rejected content item' })
  @ApiOkResponse({ type: ContentDetailResponseDto })
  update(
    @Param() params: ContentIdParamDto,
    @Body() dto: UpdateContentDto,
    @RequestId() requestId: string,
  ): Promise<ContentDetail> {
    return this.contentService.update(params.id, dto, requestId);
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive approved content' })
  @ApiCreatedResponse({ type: ContentDetailResponseDto })
  archive(
    @Param() params: ContentIdParamDto,
    @Body() dto: ActorActionDto,
    @RequestId() requestId: string,
  ): Promise<ContentDetail> {
    return this.contentService.archive(params.id, dto, requestId);
  }

  @Post(':id/revise')
  @ApiOperation({ summary: 'Create a new draft revision from approved or archived content' })
  @ApiCreatedResponse({ type: ContentDetailResponseDto })
  revise(
    @Param() params: ContentIdParamDto,
    @Body() dto: ActorActionDto,
    @RequestId() requestId: string,
  ): Promise<ContentDetail> {
    return this.contentService.revise(params.id, dto, requestId);
  }

  @Get(':id/preview')
  @ApiOperation({ summary: 'Render the Slack message for a content item without sending it' })
  @ApiOkResponse({ type: ContentPreviewResponseDto })
  preview(
    @Param() params: ContentIdParamDto,
    @Query() query: ContentPreviewQueryDto,
  ): Promise<ContentPreviewResult> {
    return this.previewService.preview(params.id, query.subscriberId);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List delivery history for a content item' })
  @ApiOkResponse({ description: 'Paginated delivery history' })
  deliveryHistory(
    @Param() params: ContentIdParamDto,
    @Query() query: DeliveryHistoryQueryDto,
  ): ReturnType<ContentService['deliveryHistory']> {
    return this.contentService.deliveryHistory(params.id, query);
  }
}
