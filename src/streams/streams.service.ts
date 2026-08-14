import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { paginate, type PaginatedResponse } from '../common/dto/pagination.dto';
import { isWithinDueWindow, localDayOfWeek } from '../common/utils/schedule-time';
import {
  ContentSelectionService,
  type SelectableContent,
} from '../deliveries/content-selection.service';
import { Prisma, ScheduleFrequency, SelectionStrategy } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { workspaceNotFound } from '../workspaces/workspaces.errors';
import {
  type CreateStreamDto,
  type ListStreamsQueryDto,
  type StreamEnableDto,
  type UpdateStreamDto,
} from './dto/stream.dto';
import { scheduleInvalid, streamNotFound } from './streams.errors';

export type StreamRecord = Prisma.ScheduleStreamGetPayload<object>;
export type SubscriberRecord = Prisma.UserSubscriberGetPayload<object>;

export interface DueStreamSubscriber {
  stream: StreamRecord;
  subscriber: SubscriberRecord;
}

@Injectable()
export class StreamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly contentSelection: ContentSelectionService,
  ) {}

  private validateAndNormalizeDaysOfWeek(
    frequency: ScheduleFrequency,
    daysOfWeek: number[] | undefined,
  ): number[] {
    if (frequency === ScheduleFrequency.DAILY) {
      return [];
    }

    if (frequency === ScheduleFrequency.WEEKLY) {
      if (!daysOfWeek || daysOfWeek.length === 0) {
        throw scheduleInvalid('WEEKLY frequency requires at least one day in daysOfWeek.');
      }
      return Array.from(new Set(daysOfWeek)).sort((a, b) => a - b);
    }

    return [];
  }

  async create(dto: CreateStreamDto, requestId: string): Promise<StreamRecord> {
    const workspace = await this.prisma.slackWorkspace.findUnique({
      where: { id: dto.workspaceId },
      select: { id: true },
    });

    if (workspace === null) {
      throw workspaceNotFound(dto.workspaceId);
    }

    const daysOfWeek = this.validateAndNormalizeDaysOfWeek(dto.frequency, dto.daysOfWeek);

    return this.prisma.$transaction(async (transaction) => {
      const stream = await transaction.scheduleStream.create({
        data: {
          workspaceId: dto.workspaceId,
          name: dto.name,
          isEnabled: dto.isEnabled ?? true,
          frequency: dto.frequency,
          sendTime: dto.sendTime,
          timezone: dto.timezone,
          daysOfWeek,
          locale: dto.locale ?? 'ar',
          allowedContentTypes: dto.allowedContentTypes,
          selectionStrategy: dto.selectionStrategy ?? SelectionStrategy.LEAST_RECENTLY_SENT,
          maxAutomaticAttempts: dto.maxAutomaticAttempts ?? 1,
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.STREAM_CREATED,
        entityType: AuditEntityType.STREAM,
        entityId: stream.id,
        workspaceId: dto.workspaceId,
        requestId,
        metadata: {
          after: {
            name: stream.name,
            isEnabled: stream.isEnabled,
            frequency: stream.frequency,
            sendTime: stream.sendTime,
          },
        },
      });

      return stream;
    });
  }

  async list(query: ListStreamsQueryDto): Promise<PaginatedResponse<StreamRecord>> {
    const where: Prisma.ScheduleStreamWhereInput = {};

    if (query.workspaceId !== undefined) {
      where.workspaceId = query.workspaceId;
    }
    if (query.isEnabled !== undefined) {
      where.isEnabled = query.isEnabled;
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.scheduleStream.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.scheduleStream.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<StreamRecord> {
    const stream = await this.prisma.scheduleStream.findUnique({ where: { id } });

    if (stream === null) {
      throw streamNotFound(id);
    }

    return stream;
  }

  async update(id: string, dto: UpdateStreamDto, requestId: string): Promise<StreamRecord> {
    const existing = await this.getById(id);

    const mergedFrequency = dto.frequency ?? existing.frequency;
    const mergedDaysOfWeek = dto.daysOfWeek ?? existing.daysOfWeek;

    const daysOfWeek = this.validateAndNormalizeDaysOfWeek(mergedFrequency, mergedDaysOfWeek);

    return this.prisma.$transaction(async (transaction) => {
      const stream = await transaction.scheduleStream.update({
        where: { id },
        data: {
          name: dto.name,
          frequency: dto.frequency,
          sendTime: dto.sendTime,
          timezone: dto.timezone,
          daysOfWeek,
          locale: dto.locale,
          allowedContentTypes: dto.allowedContentTypes,
          selectionStrategy: dto.selectionStrategy,
          maxAutomaticAttempts: dto.maxAutomaticAttempts,
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.STREAM_UPDATED,
        entityType: AuditEntityType.STREAM,
        entityId: id,
        workspaceId: existing.workspaceId,
        requestId,
        metadata: {
          before: {
            name: existing.name,
            frequency: existing.frequency,
            sendTime: existing.sendTime,
          },
          after: {
            name: stream.name,
            frequency: stream.frequency,
            sendTime: stream.sendTime,
          },
        },
      });

      return stream;
    });
  }

  /**
   * The (stream, subscriber) pairs whose local `sendTime` falls inside `[now, now + windowMinutes)`
   * right now, per PLAN.md §11.2. Due-ness is evaluated in the **subscriber's** timezone, never
   * `ScheduleStream.timezone` (§8.1 note 8 — that field is a display-only reference value). The
   * `sendTime` itself is the subscriber's own personal override (`/settings time`) when set,
   * falling back to the stream's `sendTime` otherwise — content selection is unaffected either
   * way, since that's still one selection per stream per calendar date.
   */
  async findDueStreamSubscribers(
    nowUtc: Date,
    windowMinutes: number,
  ): Promise<DueStreamSubscriber[]> {
    const streamsWithWorkspace = await this.prisma.scheduleStream.findMany({
      where: { isEnabled: true },
      include: {
        workspace: {
          select: {
            isActive: true,
            subscribers: { where: { isActive: true } },
          },
        },
      },
    });

    const due: DueStreamSubscriber[] = [];

    for (const streamWithWorkspace of streamsWithWorkspace) {
      const { workspace, ...stream } = streamWithWorkspace;

      if (!workspace.isActive) {
        continue;
      }

      for (const subscriber of workspace.subscribers) {
        if (stream.frequency === ScheduleFrequency.WEEKLY) {
          const day = localDayOfWeek(nowUtc, subscriber.timezone);
          if (!stream.daysOfWeek.includes(day)) {
            continue;
          }
        }

        const sendTime = subscriber.sendTime ?? stream.sendTime;
        if (!isWithinDueWindow(nowUtc, subscriber.timezone, sendTime, windowMinutes)) {
          continue;
        }

        due.push({ stream, subscriber });
      }
    }

    return due;
  }

  /**
   * PLAN.md §9.5: a dry run through the same §5.14 selection algorithm `reserveRun` uses. Creates
   * no `DeliveryRun`, reserves nothing, and has no side effects.
   */
  async previewNextContent(
    id: string,
  ): Promise<{ eligible: boolean; content: SelectableContent | null }> {
    const stream = await this.getById(id);
    const content = await this.contentSelection.preview(stream);

    return { eligible: content !== null, content };
  }

  async setEnabled(
    id: string,
    dto: StreamEnableDto,
    isEnabled: boolean,
    requestId: string,
  ): Promise<StreamRecord> {
    const existing = await this.getById(id);

    return this.prisma.$transaction(async (transaction) => {
      const stream = await transaction.scheduleStream.update({
        where: { id },
        data: { isEnabled },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: isEnabled ? AuditAction.STREAM_ENABLED : AuditAction.STREAM_DISABLED,
        entityType: AuditEntityType.STREAM,
        entityId: id,
        workspaceId: existing.workspaceId,
        requestId,
        metadata: {
          before: { isEnabled: existing.isEnabled },
          after: { isEnabled: stream.isEnabled },
        },
      });

      return stream;
    });
  }
}
