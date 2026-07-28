import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { PaginatedResponse } from '../common/dto/pagination.dto';
import { AuditService, type AuditEventRecord } from './audit.service';
import { AuditEventResponseDto } from './dto/audit-event-response.dto';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto';

@ApiTags('Audit')
@ApiSecurity('admin-key')
@Controller('audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List immutable audit events' })
  @ApiOkResponse({ type: AuditEventResponseDto, isArray: true })
  list(@Query() query: ListAuditEventsQueryDto): Promise<PaginatedResponse<AuditEventRecord>> {
    return this.auditService.list(query);
  }
}
