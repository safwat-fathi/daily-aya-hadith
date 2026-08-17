import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { ContentStatus } from '../generated/prisma/enums';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { paginate, type PaginatedResponse } from '../common/dto/pagination.dto';
import { toJsonFieldInput } from '../common/utils/prisma-json';
import { PrismaService } from '../prisma/prisma.service';
import { ContentChecksumService } from './content-checksum.service';
import { ContentValidationService } from './content-validation.service';
import { contentNotFound, contentUpdateConflict, invalidStatusTransition } from './content.errors';
import {
  contentDetailArgs,
  contentSummarySelect,
  deliveryHistoryArgs,
  type ContentDetail,
  type ContentSummary,
  type DeliveryHistoryEntry,
} from './content.select';
import { CreateContentDto } from './dto/create-content.dto';
import { ContentSort, DeliveryHistoryQueryDto, ListContentQueryDto } from './dto/content-query.dto';
import { ActorActionDto } from './dto/review-action.dto';
import { SourceReferenceDto } from './dto/source-reference.dto';
import { UpdateContentDto } from './dto/update-content.dto';

function sourceCreateData(
  source: SourceReferenceDto,
  sortOrder: number,
): Prisma.ContentSourceCreateWithoutContentInput {
  return {
    sourceType: source.sourceType,
    title: source.title,
    author: source.author,
    publisher: source.publisher,
    edition: source.edition,
    volume: source.volume,
    page: source.page,
    chapter: source.chapter,
    referenceNumber: source.referenceNumber,
    url: source.url,
    notes: source.notes,
    surahNumber: source.surahNumber,
    surahNameArabic: source.surahNameArabic,
    surahNameEnglish: source.surahNameEnglish,
    ayahNumber: source.ayahNumber,
    sortOrder,
  };
}

function copiedSourceData(
  source: ContentDetail['sources'][number],
  sortOrder: number,
): Prisma.ContentSourceCreateWithoutContentInput {
  return {
    sourceType: source.sourceType,
    title: source.title,
    author: source.author,
    publisher: source.publisher,
    edition: source.edition,
    volume: source.volume,
    page: source.page,
    chapter: source.chapter,
    referenceNumber: source.referenceNumber,
    url: source.url,
    notes: source.notes,
    surahNumber: source.surahNumber,
    surahNameArabic: source.surahNameArabic,
    surahNameEnglish: source.surahNameEnglish,
    ayahNumber: source.ayahNumber,
    sortOrder,
  };
}

function statusMetadata(
  status: ContentStatus,
  version: number,
): { status: ContentStatus; version: number } {
  return { status, version };
}

function orderByFor(sort: ContentSort): Prisma.ContentItemOrderByWithRelationInput {
  const [field, direction] = sort.split(':') as [
    'createdAt' | 'updatedAt' | 'title',
    'asc' | 'desc',
  ];
  return { [field]: direction };
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly validationService: ContentValidationService,
    private readonly checksumService: ContentChecksumService,
  ) {}

  async create(dto: CreateContentDto, requestId: string): Promise<ContentDetail> {
    const payload = await this.validationService.validateDraft(dto.type, dto.payload);

    const contentId = await this.prisma.$transaction(async (transaction) => {
      const content = await transaction.contentItem.create({
        data: {
          type: dto.type,
          locale: dto.locale,
          title: dto.title,
          payload,
          createdBy: dto.createdBy,
          updatedBy: dto.createdBy,
          sources: {
            create: dto.sources.map(sourceCreateData),
          },
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.createdBy,
        action: AuditAction.CONTENT_CREATED,
        entityType: AuditEntityType.CONTENT,
        entityId: content.id,
        requestId,
        metadata: {
          after: statusMetadata(content.status, content.version),
          type: content.type,
        },
      });

      return content.id;
    });

    return this.getById(contentId);
  }

  /** Used only by the import services (`HadithImportService`, `QuranImportService`) — creates
   * content already `APPROVED`, gated by the same strict `validateForApproval` rules and
   * checksum computation a human approval would apply, never passing through an intermediate
   * `DRAFT`/`IN_REVIEW` row. Manual creation (`create()` above) is untouched by this method. */
  async createApproved(dto: CreateContentDto, requestId: string): Promise<ContentDetail> {
    const payload = await this.validationService.validateForApproval({
      type: dto.type,
      payload: dto.payload,
      sources: dto.sources,
    });

    const sourcesData = dto.sources.map(sourceCreateData);
    const checksum = this.checksumService.calculate({
      type: dto.type,
      locale: dto.locale,
      title: dto.title ?? null,
      payload,
      version: 1,
      sources: sourcesData.map((source, index) => ({ ...source, sortOrder: index })),
    });

    const contentId = await this.prisma.$transaction(async (transaction) => {
      const content = await transaction.contentItem.create({
        data: {
          type: dto.type,
          locale: dto.locale,
          title: dto.title,
          payload,
          status: ContentStatus.APPROVED,
          reviewerId: dto.createdBy,
          approvedAt: new Date(),
          contentChecksum: checksum,
          createdBy: dto.createdBy,
          updatedBy: dto.createdBy,
          sources: { create: sourcesData },
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.createdBy,
        action: AuditAction.CONTENT_CREATED,
        entityType: AuditEntityType.CONTENT,
        entityId: content.id,
        requestId,
        metadata: {
          after: statusMetadata(content.status, content.version),
          type: content.type,
        },
      });
      await this.auditService.record(transaction, {
        actorId: dto.createdBy,
        action: AuditAction.CONTENT_APPROVED,
        entityType: AuditEntityType.CONTENT,
        entityId: content.id,
        requestId,
        metadata: {
          after: { status: ContentStatus.APPROVED },
          contentChecksum: checksum,
          version: content.version,
          autoApproved: true,
        },
      });

      return content.id;
    });

    return this.getById(contentId);
  }

  async list(query: ListContentQueryDto): Promise<PaginatedResponse<ContentSummary>> {
    const where: Prisma.ContentItemWhereInput = {
      type: query.type,
      status: query.status,
      locale: query.locale,
      OR: query.search
        ? [
            { title: { contains: query.search, mode: 'insensitive' } },
            {
              sources: {
                some: {
                  title: { contains: query.search, mode: 'insensitive' },
                },
              },
            },
          ]
        : undefined,
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentItem.findMany({
        where,
        orderBy: orderByFor(query.sort),
        skip,
        take: query.limit,
        select: contentSummarySelect,
      }),
      this.prisma.contentItem.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<ContentDetail> {
    const content = await this.prisma.contentItem.findUnique({
      where: { id },
      ...contentDetailArgs,
    });

    if (!content) {
      throw contentNotFound(id);
    }

    return content;
  }

  async update(id: string, dto: UpdateContentDto, requestId: string): Promise<ContentDetail> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contentItem.findUnique({
        where: { id },
        include: { sources: { orderBy: { sortOrder: 'asc' } } },
      });

      if (!existing) {
        throw contentNotFound(id);
      }

      if (existing.status !== ContentStatus.DRAFT && existing.status !== ContentStatus.REJECTED) {
        throw invalidStatusTransition(existing.status, 'edited');
      }

      const type = dto.type ?? existing.type;
      const payload = await this.validationService.validateDraft(
        type,
        dto.payload ?? existing.payload,
      );
      const nextStatus =
        existing.status === ContentStatus.REJECTED ? ContentStatus.DRAFT : existing.status;
      const updated = await transaction.contentItem.updateMany({
        where: {
          id,
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
        data: {
          type,
          locale: dto.locale,
          title: dto.title,
          payload,
          status: nextStatus,
          reviewerId: existing.status === ContentStatus.REJECTED ? null : undefined,
          reviewNote: existing.status === ContentStatus.REJECTED ? null : undefined,
          rejectedAt: existing.status === ContentStatus.REJECTED ? null : undefined,
          updatedBy: dto.updatedBy,
        },
      });

      if (updated.count !== 1) {
        throw contentUpdateConflict();
      }

      if (dto.sources) {
        await transaction.contentSource.deleteMany({ where: { contentId: id } });
        await transaction.contentSource.createMany({
          data: dto.sources.map((source, index) => ({
            contentId: id,
            ...sourceCreateData(source, index),
          })),
        });
      }

      await this.auditService.record(transaction, {
        actorId: dto.updatedBy,
        action: AuditAction.CONTENT_EDITED,
        entityType: AuditEntityType.CONTENT,
        entityId: id,
        requestId,
        metadata: {
          before: statusMetadata(existing.status, existing.version),
          after: statusMetadata(nextStatus, existing.version),
          replacedPayload: dto.payload !== undefined,
          replacedSources: dto.sources !== undefined,
        },
      });
    });

    return this.getById(id);
  }

  async archive(id: string, dto: ActorActionDto, requestId: string): Promise<ContentDetail> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contentItem.findUnique({ where: { id } });

      if (!existing) {
        throw contentNotFound(id);
      }

      if (existing.status !== ContentStatus.APPROVED) {
        throw invalidStatusTransition(existing.status, 'archived');
      }

      await transaction.contentItem.update({
        where: { id },
        data: {
          status: ContentStatus.ARCHIVED,
          archivedAt: new Date(),
          updatedBy: dto.actorId,
        },
      });
      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.CONTENT_ARCHIVED,
        entityType: AuditEntityType.CONTENT,
        entityId: id,
        requestId,
        metadata: {
          before: statusMetadata(existing.status, existing.version),
          after: statusMetadata(ContentStatus.ARCHIVED, existing.version),
        },
      });
    });

    return this.getById(id);
  }

  async revise(id: string, dto: ActorActionDto, requestId: string): Promise<ContentDetail> {
    const revisionId = await this.prisma.$transaction(
      async (transaction) => {
        const existing = await transaction.contentItem.findUnique({
          where: { id },
          ...contentDetailArgs,
        });

        if (!existing) {
          throw contentNotFound(id);
        }

        if (
          existing.status !== ContentStatus.APPROVED &&
          existing.status !== ContentStatus.ARCHIVED
        ) {
          throw invalidStatusTransition(existing.status, 'revised');
        }

        const rootId = existing.parentContentId ?? existing.id;
        const latestVersion = await transaction.contentItem.aggregate({
          where: {
            OR: [{ id: rootId }, { parentContentId: rootId }],
          },
          _max: { version: true },
        });
        const version = (latestVersion._max.version ?? 0) + 1;
        const revision = await transaction.contentItem.create({
          data: {
            type: existing.type,
            locale: existing.locale,
            title: existing.title,
            payload: toJsonFieldInput(existing.payload),
            version,
            parentContentId: rootId,
            createdBy: dto.actorId,
            updatedBy: dto.actorId,
            sources: {
              create: existing.sources.map(copiedSourceData),
            },
          },
        });

        await this.auditService.record(transaction, {
          actorId: dto.actorId,
          action: AuditAction.CONTENT_REVISED,
          entityType: AuditEntityType.CONTENT,
          entityId: revision.id,
          requestId,
          metadata: {
            parentContentId: rootId,
            sourceContentId: existing.id,
            version,
          },
        });

        return revision.id;
      },
      { isolationLevel: 'Serializable' },
    );

    return this.getById(revisionId);
  }

  async deliveryHistory(
    id: string,
    query: DeliveryHistoryQueryDto,
  ): Promise<PaginatedResponse<DeliveryHistoryEntry>> {
    const exists = await this.prisma.contentItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw contentNotFound(id);
    }

    // A delivery is now one message to one subscriber, and the content it carried is recorded on
    // the parent cycle, so "who received this item" reads through the run. The run is included
    // because the delivery row alone no longer says which content or which date it belonged to.
    const where: Prisma.ContentDeliveryWhereInput = { run: { contentId: id } };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentDelivery.findMany({
        where,
        ...deliveryHistoryArgs,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.contentDelivery.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }
}
