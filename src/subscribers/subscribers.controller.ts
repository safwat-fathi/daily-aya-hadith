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
import {
  CreateSubscriberDto,
  ListSubscribersQueryDto,
  SubscriberIdParamDto,
  SubscriberResponseDto,
  UpdateSubscriberDto,
} from './dto/subscriber.dto';
import { SubscribersService, type SubscriberRecord } from './subscribers.service';

@ApiTags('Subscribers')
@ApiSecurity('admin-key')
@Controller('subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Post()
  @ApiOperation({ summary: 'Subscribe a Slack user to scheduled content' })
  @ApiCreatedResponse({ type: SubscriberResponseDto })
  create(
    @Body() dto: CreateSubscriberDto,
    @RequestId() requestId: string,
  ): Promise<SubscriberRecord> {
    return this.subscribersService.create(dto, requestId);
  }

  @Get()
  @ApiOperation({ summary: 'List user subscribers' })
  @ApiOkResponse({ type: SubscriberResponseDto, isArray: true })
  list(@Query() query: ListSubscribersQueryDto): Promise<PaginatedResponse<SubscriberRecord>> {
    return this.subscribersService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user subscriber' })
  @ApiOkResponse({ type: SubscriberResponseDto })
  getById(@Param() params: SubscriberIdParamDto): Promise<SubscriberRecord> {
    return this.subscribersService.getById(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subscriber' })
  @ApiOkResponse({ type: SubscriberResponseDto })
  update(
    @Param() params: SubscriberIdParamDto,
    @Body() dto: UpdateSubscriberDto,
    @RequestId() requestId: string,
  ): Promise<SubscriberRecord> {
    return this.subscribersService.update(params.id, dto, requestId);
  }
}
