import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RunIdParamDto } from './dto/list-deliveries-query.dto';
import { RunResponseDto } from './dto/run-response.dto';
import type { RunDetail } from './deliveries.select';
import { RunsService } from './runs.service';

/** PLAN.md §9.6: a top-level route, not nested under `/deliveries`. */
@ApiTags('Deliveries')
@ApiSecurity('admin-key')
@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a delivery cycle: selected content, snapshot, per-subscriber outcomes',
  })
  @ApiOkResponse({ type: RunResponseDto })
  getById(@Param() params: RunIdParamDto): Promise<RunDetail> {
    return this.runsService.getById(params.id);
  }
}
