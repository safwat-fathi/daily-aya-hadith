import { Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { ContentChecksumService } from '../content/content-checksum.service';
import { ContentValidationService } from '../content/content-validation.service';
import { contentNotFound, invalidStatusTransition } from '../content/content.errors';
import type { ContentDetail } from '../content/content.select';
import { ContentService } from '../content/content.service';
import {
  ActorActionDto,
  RejectContentDto,
  ReviewDecisionDto,
} from '../content/dto/review-action.dto';
import { ContentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly contentService: ContentService,
    private readonly validationService: ContentValidationService,
    private readonly checksumService: ContentChecksumService,
  ) {}

  async submit(id: string, dto: ActorActionDto, requestId: string): Promise<ContentDetail> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contentItem.findUnique({ where: { id } });
      if (!existing) {
        throw contentNotFound(id);
      }
      if (existing.status !== ContentStatus.DRAFT) {
        throw invalidStatusTransition(existing.status, 'submitted for review');
      }

      await transaction.contentItem.update({
        where: { id },
        data: {
          status: ContentStatus.IN_REVIEW,
          submittedForReviewAt: new Date(),
          updatedBy: dto.actorId,
        },
      });
      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.CONTENT_SUBMITTED_FOR_REVIEW,
        entityType: AuditEntityType.CONTENT,
        entityId: id,
        requestId,
        metadata: {
          before: { status: existing.status },
          after: { status: ContentStatus.IN_REVIEW },
          version: existing.version,
        },
      });
    });

    return this.contentService.getById(id);
  }

  async approve(id: string, dto: ReviewDecisionDto, requestId: string): Promise<ContentDetail> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contentItem.findUnique({
        where: { id },
        include: { sources: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!existing) {
        throw contentNotFound(id);
      }
      if (existing.status !== ContentStatus.IN_REVIEW) {
        throw invalidStatusTransition(existing.status, 'approved');
      }

      const payload = await this.validationService.validateForApproval(existing);
      const checksum = this.checksumService.calculate({
        type: existing.type,
        locale: existing.locale,
        title: existing.title,
        payload,
        version: existing.version,
        sources: existing.sources,
      });

      await transaction.contentItem.update({
        where: { id },
        data: {
          status: ContentStatus.APPROVED,
          payload,
          reviewerId: dto.reviewerId,
          reviewNote: dto.reviewNote,
          approvedAt: new Date(),
          rejectedAt: null,
          contentChecksum: checksum,
          updatedBy: dto.reviewerId,
        },
      });
      await this.auditService.record(transaction, {
        actorId: dto.reviewerId,
        action: AuditAction.CONTENT_APPROVED,
        entityType: AuditEntityType.CONTENT,
        entityId: id,
        requestId,
        metadata: {
          before: { status: existing.status },
          after: { status: ContentStatus.APPROVED },
          contentChecksum: checksum,
          version: existing.version,
        },
      });
    });

    return this.contentService.getById(id);
  }

  async reject(id: string, dto: RejectContentDto, requestId: string): Promise<ContentDetail> {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.contentItem.findUnique({ where: { id } });
      if (!existing) {
        throw contentNotFound(id);
      }
      if (existing.status !== ContentStatus.IN_REVIEW) {
        throw invalidStatusTransition(existing.status, 'rejected');
      }

      await transaction.contentItem.update({
        where: { id },
        data: {
          status: ContentStatus.REJECTED,
          reviewerId: dto.reviewerId,
          reviewNote: dto.reviewNote,
          rejectedAt: new Date(),
          approvedAt: null,
          contentChecksum: null,
          updatedBy: dto.reviewerId,
        },
      });
      await this.auditService.record(transaction, {
        actorId: dto.reviewerId,
        action: AuditAction.CONTENT_REJECTED,
        entityType: AuditEntityType.CONTENT,
        entityId: id,
        requestId,
        metadata: {
          before: { status: existing.status },
          after: { status: ContentStatus.REJECTED },
          reviewNote: dto.reviewNote,
          version: existing.version,
        },
      });
    });

    return this.contentService.getById(id);
  }
}
