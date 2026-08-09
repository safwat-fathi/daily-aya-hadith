import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import type { ActorDto } from '../common/dto/actor.dto';
import { paginate, type PaginatedResponse } from '../common/dto/pagination.dto';
import type { Prisma } from '../generated/prisma/client';
import { DeliveryStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryOrchestratorService } from './delivery-orchestrator.service';
import { deliveryAlreadyResolved, deliveryNotFound, deliveryNotRetryable } from './deliveries.errors';
import { deliveryListArgs, type DeliveryListEntry } from './deliveries.select';
import type { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import type { MarkSkippedDto } from './dto/mark-skipped.dto';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly orchestrator: DeliveryOrchestratorService,
  ) {}

  async list(query: ListDeliveriesQueryDto): Promise<PaginatedResponse<DeliveryListEntry>> {
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    const where: Prisma.ContentDeliveryWhereInput = {
      status: query.status,
      runId: query.runId,
      subscriberId: query.subscriberId,
      run:
        query.streamId !== undefined || query.contentId !== undefined
          ? { streamId: query.streamId, contentId: query.contentId }
          : undefined,
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
      this.prisma.contentDelivery.findMany({
        where,
        ...deliveryListArgs,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.contentDelivery.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<DeliveryListEntry> {
    const delivery = await this.prisma.contentDelivery.findUnique({
      where: { id },
      ...deliveryListArgs,
    });

    if (delivery === null) {
      throw deliveryNotFound(id);
    }

    return delivery;
  }

  /**
   * PLAN.md §9.6: only `FAILED` deliveries with `isRetryable=true` can be retried here — a
   * permanent Slack failure such as `account_inactive` is never retried, manually or otherwise.
   * Unlike the automatic sweep, this is not bounded by `maxAutomaticAttempts`: an admin can
   * always ask for one more attempt.
   */
  async retry(id: string, dto: ActorDto, requestId: string): Promise<DeliveryListEntry> {
    const existing = await this.prisma.contentDelivery.findUnique({ where: { id } });

    if (existing === null) {
      throw deliveryNotFound(id);
    }

    if (existing.status !== DeliveryStatus.FAILED || existing.isRetryable !== true) {
      throw deliveryNotRetryable(id);
    }

    await this.orchestrator.sendDelivery(id);

    const updated = await this.prisma.contentDelivery.findUniqueOrThrow({ where: { id } });

    await this.prisma.$transaction(async (transaction) => {
      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.DELIVERY_RETRIED,
        entityType: AuditEntityType.DELIVERY,
        entityId: id,
        requestId,
        metadata: {
          before: { status: existing.status, errorCode: existing.errorCode },
          after: { status: updated.status, errorCode: updated.errorCode },
        },
      });
    });

    return this.getById(id);
  }

  /** Administrative escape hatch (PLAN.md §9.6), scoped to one subscriber's delivery. */
  async markSkipped(id: string, dto: MarkSkippedDto, requestId: string): Promise<DeliveryListEntry> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contentDelivery.findUnique({ where: { id } });

      if (existing === null) {
        throw deliveryNotFound(id);
      }

      if (existing.status === DeliveryStatus.SENT || existing.status === DeliveryStatus.SKIPPED) {
        throw deliveryAlreadyResolved(id);
      }

      await transaction.contentDelivery.update({
        where: { id },
        data: {
          status: DeliveryStatus.SKIPPED,
          errorCode: 'ADMIN_SKIPPED',
          errorMessage: dto.reason,
          isRetryable: false,
          nextRetryAt: null,
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.DELIVERY_MARKED_SKIPPED,
        entityType: AuditEntityType.DELIVERY,
        entityId: id,
        requestId,
        metadata: {
          before: { status: existing.status },
          after: { status: DeliveryStatus.SKIPPED, reason: dto.reason },
        },
      });
    });

    return this.getById(id);
  }
}
