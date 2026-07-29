import { Inject, Injectable } from '@nestjs/common';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { ActorDto } from '../common/dto/actor.dto';
import { paginate, type PaginatedResponse } from '../common/dto/pagination.dto';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SLACK_GATEWAY, type SlackGateway } from '../slack/slack.gateway';
import {
  CreateWorkspaceDto,
  ListWorkspacesQueryDto,
  UpdateWorkspaceDto,
} from './dto/workspace.dto';
import { workspaceAlreadyExists, workspaceNotFound } from './workspaces.errors';

export type WorkspaceRecord = Prisma.SlackWorkspaceGetPayload<object>;

export interface VerifyTokenResult {
  workspace: WorkspaceRecord;
  teamId: string;
  teamName?: string;
  botUserId?: string;
  verifiedAt: Date;
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(SLACK_GATEWAY) private readonly slack: SlackGateway,
  ) {}

  async create(dto: CreateWorkspaceDto, requestId: string): Promise<WorkspaceRecord> {
    const existing = await this.prisma.slackWorkspace.findUnique({
      where: { slackTeamId: dto.slackTeamId },
      select: { id: true },
    });

    // Explicit check for a clear error; the unique index still backstops a concurrent insert,
    // which AllExceptionsFilter maps from P2002 to 409 RESOURCE_CONFLICT.
    if (existing !== null) {
      throw workspaceAlreadyExists(dto.slackTeamId);
    }

    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.slackWorkspace.create({
        data: {
          slackTeamId: dto.slackTeamId,
          name: dto.name,
          tokenSecretKey: dto.tokenSecretKey,
          isActive: dto.isActive ?? true,
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.WORKSPACE_CREATED,
        entityType: AuditEntityType.WORKSPACE,
        entityId: workspace.id,
        workspaceId: workspace.id,
        requestId,
        metadata: {
          after: { slackTeamId: workspace.slackTeamId, isActive: workspace.isActive },
        },
      });

      return workspace;
    });
  }

  async list(query: ListWorkspacesQueryDto): Promise<PaginatedResponse<WorkspaceRecord>> {
    const where: Prisma.SlackWorkspaceWhereInput = { isActive: query.isActive };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.slackWorkspace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.slackWorkspace.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async getById(id: string): Promise<WorkspaceRecord> {
    const workspace = await this.prisma.slackWorkspace.findUnique({ where: { id } });

    if (workspace === null) {
      throw workspaceNotFound(id);
    }

    return workspace;
  }

  async update(id: string, dto: UpdateWorkspaceDto, requestId: string): Promise<WorkspaceRecord> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.slackWorkspace.findUnique({ where: { id } });

      if (existing === null) {
        throw workspaceNotFound(id);
      }

      // slackTeamId is intentionally immutable: it is the identity the verified token is
      // checked against, and rewriting it would invalidate every prior verification.
      const workspace = await transaction.slackWorkspace.update({
        where: { id },
        data: {
          name: dto.name,
          tokenSecretKey: dto.tokenSecretKey,
          isActive: dto.isActive,
        },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.WORKSPACE_UPDATED,
        entityType: AuditEntityType.WORKSPACE,
        entityId: id,
        workspaceId: id,
        requestId,
        metadata: {
          before: { name: existing.name, isActive: existing.isActive },
          after: { name: workspace.name, isActive: workspace.isActive },
        },
      });

      return workspace;
    });
  }

  async verifyToken(id: string, dto: ActorDto, requestId: string): Promise<VerifyTokenResult> {
    // Slack call first, transaction second: a database transaction is never held open across a
    // network round trip.
    const identity = await this.slack.verifyToken(id);
    const verifiedAt = new Date();

    const workspace = await this.prisma.$transaction(async (transaction) => {
      // Slack's own team name is returned to the caller but never overwrites the administrator's
      // chosen `name`, which may deliberately differ.
      const updated = await transaction.slackWorkspace.update({
        where: { id },
        data: { botUserId: identity.botUserId, tokenLastVerifiedAt: verifiedAt },
      });

      await this.auditService.record(transaction, {
        actorId: dto.actorId,
        action: AuditAction.WORKSPACE_TOKEN_VERIFIED,
        entityType: AuditEntityType.WORKSPACE,
        entityId: id,
        workspaceId: id,
        requestId,
        metadata: {
          teamId: identity.teamId,
          botUserId: identity.botUserId,
          verifiedAt: verifiedAt.toISOString(),
        },
      });

      return updated;
    });

    return {
      workspace,
      teamId: identity.teamId,
      teamName: identity.teamName,
      botUserId: identity.botUserId,
      verifiedAt,
    };
  }
}
