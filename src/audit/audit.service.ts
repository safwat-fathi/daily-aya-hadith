import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { paginate, type PaginatedResponse } from '../common/dto/pagination.dto';
import { toInputJsonObject } from '../common/utils/prisma-json';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditEventsQueryDto } from './dto/list-audit-events-query.dto';

export type AuditEventRecord = Prisma.AuditEventGetPayload<object>;

interface RecordAuditEventInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(transaction: Prisma.TransactionClient, input: RecordAuditEventInput): Promise<unknown> {
    return transaction.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        requestId: input.requestId,
        workspaceId: input.workspaceId,
        metadata: input.metadata === undefined ? undefined : toInputJsonObject(input.metadata),
      },
    });
  }

  async list(query: ListAuditEventsQueryDto): Promise<PaginatedResponse<AuditEventRecord>> {
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'AUDIT_DATE_RANGE_INVALID',
        message: 'dateFrom must be earlier than or equal to dateTo.',
      });
    }

    const where: Prisma.AuditEventWhereInput = {
      actorId: query.actorId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      createdAt:
        dateFrom || dateTo
          ? {
              gte: dateFrom,
              lte: dateTo,
            }
          : undefined,
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }
}
