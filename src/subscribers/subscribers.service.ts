import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { paginate, type PaginatedResponse } from '../common/dto/pagination.dto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { workspaceNotFound } from '../workspaces/workspaces.errors';
import {
  type CreateSubscriberDto,
  type ListSubscribersQueryDto,
  type UpdateSubscriberDto,
} from './dto/subscriber.dto';
import { subscriberAlreadyExists, subscriberNotFound } from './subscribers.errors';

export type SubscriberRecord = Prisma.UserSubscriberGetPayload<object>;

@Injectable()
export class SubscribersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateSubscriberDto, requestId: string): Promise<SubscriberRecord> {
    const workspace = await this.prisma.slackWorkspace.findUnique({
      where: { id: dto.workspaceId },
      select: { id: true },
    });

    if (workspace === null) {
      throw workspaceNotFound(dto.workspaceId);
    }

    const existing = await this.prisma.userSubscriber.findUnique({
      where: {
        workspaceId_slackUserId: {
          workspaceId: dto.workspaceId,
          slackUserId: dto.slackUserId,
        },
      },
      select: { id: true },
    });

    if (existing !== null) {
      throw subscriberAlreadyExists(dto.workspaceId, dto.slackUserId);
    }

    return this.prisma.$transaction(async (transaction) => {
      const subscriber = await transaction.userSubscriber.create({
        data: {
          workspaceId: dto.workspaceId,
          slackUserId: dto.slackUserId,
          timezone: dto.timezone,
          locale: dto.locale,
          isActive: dto.isActive ?? true,
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.SUBSCRIBER_CREATED,
        entityType: AuditEntityType.SUBSCRIBER,
        entityId: subscriber.id,
        workspaceId: dto.workspaceId,
        requestId,
        metadata: {
          after: { slackUserId: subscriber.slackUserId, isActive: subscriber.isActive },
        },
      });

      return subscriber;
    });
  }

  async list(query: ListSubscribersQueryDto): Promise<PaginatedResponse<SubscriberRecord>> {
    const where: Prisma.UserSubscriberWhereInput = {
      workspaceId: query.workspaceId,
      isActive: query.isActive,
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.userSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.userSubscriber.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<SubscriberRecord> {
    const subscriber = await this.prisma.userSubscriber.findUnique({ where: { id } });

    if (subscriber === null) {
      throw subscriberNotFound(id);
    }

    return subscriber;
  }

  async getByUserId(workspaceId: string, slackUserId: string): Promise<SubscriberRecord | null> {
    return this.prisma.userSubscriber.findUnique({
      where: {
        workspaceId_slackUserId: { workspaceId, slackUserId },
      },
    });
  }

  async update(id: string, dto: UpdateSubscriberDto, requestId: string): Promise<SubscriberRecord> {
    const existing = await this.getById(id);

    return this.prisma.$transaction(async (transaction) => {
      const subscriber = await transaction.userSubscriber.update({
        where: { id },
        data: {
          timezone: dto.timezone,
          locale: dto.locale,
          isActive: dto.isActive,
          sendTime: dto.sendTime,
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.SUBSCRIBER_UPDATED,
        entityType: AuditEntityType.SUBSCRIBER,
        entityId: id,
        workspaceId: existing.workspaceId,
        requestId,
        metadata: {
          before: {
            isActive: existing.isActive,
            locale: existing.locale,
            timezone: existing.timezone,
            sendTime: existing.sendTime,
          },
          after: {
            isActive: subscriber.isActive,
            locale: subscriber.locale,
            timezone: subscriber.timezone,
            sendTime: subscriber.sendTime,
          },
        },
      });

      return subscriber;
    });
  }
}
