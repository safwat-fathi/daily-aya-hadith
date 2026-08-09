import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ActorDto } from '../common/dto/actor.dto';
import { RequestId } from '../common/decorators/request-id.decorator';
import type { PaginatedResponse } from '../common/dto/pagination.dto';
import { DeliveriesService } from './deliveries.service';
import type { DeliveryListEntry } from './deliveries.select';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { DeliveryIdParamDto, ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import { MarkSkippedDto } from './dto/mark-skipped.dto';

@ApiTags('Deliveries')
@ApiSecurity('admin-key')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Get()
  @ApiOperation({ summary: 'List per-subscriber deliveries' })
  @ApiOkResponse({ type: DeliveryResponseDto, isArray: true })
  list(@Query() query: ListDeliveriesQueryDto): Promise<PaginatedResponse<DeliveryListEntry>> {
    return this.deliveriesService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one subscriber delivery, with its run' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  getById(@Param() params: DeliveryIdParamDto): Promise<DeliveryListEntry> {
    return this.deliveriesService.getById(params.id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry one failed, retryable delivery' })
  @ApiOkResponse({
    type: DeliveryResponseDto,
    description: 'Resends the run’s stored snapshot; never re-renders.',
  })
  retry(
    @Param() params: DeliveryIdParamDto,
    @Body() dto: ActorDto,
    @RequestId() requestId: string,
  ): Promise<DeliveryListEntry> {
    return this.deliveriesService.retry(params.id, dto, requestId);
  }

  @Post(':id/mark-skipped')
  @ApiOperation({ summary: 'Administrative escape hatch: mark a delivery as skipped' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  markSkipped(
    @Param() params: DeliveryIdParamDto,
    @Body() dto: MarkSkippedDto,
    @RequestId() requestId: string,
  ): Promise<DeliveryListEntry> {
    return this.deliveriesService.markSkipped(params.id, dto, requestId);
  }
}
