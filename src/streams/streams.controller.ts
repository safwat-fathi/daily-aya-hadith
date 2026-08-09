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
  CreateStreamDto,
  ListStreamsQueryDto,
  StreamEnableDto,
  StreamIdParamDto,
  StreamResponseDto,
  UpdateStreamDto,
} from './dto/stream.dto';
import { StreamsService, type StreamRecord } from './streams.service';

@ApiTags('Streams')
@ApiSecurity('admin-key')
@Controller('streams')
export class StreamsController {
  constructor(private readonly streamsService: StreamsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a scheduled content stream' })
  @ApiCreatedResponse({ type: StreamResponseDto })
  create(@Body() dto: CreateStreamDto, @RequestId() requestId: string): Promise<StreamRecord> {
    return this.streamsService.create(dto, requestId);
  }

  @Get()
  @ApiOperation({ summary: 'List streams' })
  @ApiOkResponse({ type: StreamResponseDto, isArray: true })
  list(@Query() query: ListStreamsQueryDto): Promise<PaginatedResponse<StreamRecord>> {
    return this.streamsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a stream' })
  @ApiOkResponse({ type: StreamResponseDto })
  getById(@Param() params: StreamIdParamDto): Promise<StreamRecord> {
    return this.streamsService.getById(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a stream configuration (not including isEnabled)' })
  @ApiOkResponse({ type: StreamResponseDto })
  update(
    @Param() params: StreamIdParamDto,
    @Body() dto: UpdateStreamDto,
    @RequestId() requestId: string,
  ): Promise<StreamRecord> {
    return this.streamsService.update(params.id, dto, requestId);
  }

  @Post(':id/enable')
  @ApiOperation({ summary: 'Enable a stream' })
  @ApiOkResponse({ type: StreamResponseDto })
  enable(
    @Param() params: StreamIdParamDto,
    @Body() dto: StreamEnableDto,
    @RequestId() requestId: string,
  ): Promise<StreamRecord> {
    return this.streamsService.setEnabled(params.id, dto, true, requestId);
  }

  @Post(':id/disable')
  @ApiOperation({ summary: 'Disable a stream' })
  @ApiOkResponse({ type: StreamResponseDto })
  disable(
    @Param() params: StreamIdParamDto,
    @Body() dto: StreamEnableDto,
    @RequestId() requestId: string,
  ): Promise<StreamRecord> {
    return this.streamsService.setEnabled(params.id, dto, false, requestId);
  }
}
