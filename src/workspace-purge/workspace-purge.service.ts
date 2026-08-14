import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AuditAction, AuditEntityType } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { CLOCK, type Clock } from '../common/clock/clock';
import type { AppEnvironment } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerLockService } from '../scheduler/scheduler.lock';

const TICK_INTERVAL_NAME = 'workspace-purge-tick';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Hard-deletes a `SlackWorkspace` (cascading its subscribers, streams, delivery runs, and
 * deliveries — all declared `onDelete: Cascade` in the schema) once it has been uninstalled
 * (`SlackWorkspace.uninstalledAt`) for at least `WORKSPACE_PURGE_GRACE_DAYS`. This is what
 * fulfills the privacy policy's "we will periodically purge data associated with uninstalled
 * workspaces" — `SlackEventsService.onAppUninstalled` only soft-deactivates and wipes the token;
 * this job does the actual deletion, on a delay, so a stray/duplicate uninstall event or a fast
 * reinstall has a recovery window.
 *
 * Mirrors `SchedulerService`'s shape: a plain `setInterval` registered through
 * `SchedulerRegistry` (not a cron expression, for the same reason `SchedulerService` avoids one),
 * guarded by the same advisory-lock pattern (`SchedulerLockService`) so a sweep can never
 * overlap itself across multiple processes.
 */
@Injectable()
export class WorkspacePurgeService implements OnModuleInit {
  private readonly logger = new Logger(WorkspacePurgeService.name);
  private readonly enabled: boolean;
  private readonly intervalMinutes: number;
  private readonly graceDays: number;
  private readonly lockId: number;

  constructor(
    config: ConfigService<AppEnvironment, true>,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly lock: SchedulerLockService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.enabled = config.get('WORKSPACE_PURGE_ENABLED', { infer: true });
    this.intervalMinutes = config.get('WORKSPACE_PURGE_INTERVAL_MINUTES', { infer: true });
    this.graceDays = config.get('WORKSPACE_PURGE_GRACE_DAYS', { infer: true });
    this.lockId = config.get('WORKSPACE_PURGE_LOCK_ID', { infer: true });
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Workspace purge disabled (WORKSPACE_PURGE_ENABLED=false).');
      return;
    }

    const interval = setInterval(() => {
      this.tick().catch((error: unknown) => {
        this.logger.error({
          event: 'workspace_purge_tick_unhandled_error',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.intervalMinutes * 60_000);

    this.schedulerRegistry.addInterval(TICK_INTERVAL_NAME, interval);
    this.logger.log(
      `Workspace purge enabled: sweeping every ${this.intervalMinutes} minute(s), ${this.graceDays}-day grace period.`,
    );
  }

  async tick(): Promise<void> {
    await this.lock.withLock(this.lockId, () => this.runPurge());
  }

  private async runPurge(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - this.graceDays * MS_PER_DAY);

    const candidates = await this.prisma.slackWorkspace.findMany({
      where: { isActive: false, uninstalledAt: { lte: cutoff } },
      select: { id: true, slackTeamId: true, uninstalledAt: true },
    });

    let purgedCount = 0;

    for (const workspace of candidates) {
      try {
        await this.prisma.$transaction(async (transaction) => {
          await this.auditService.record(transaction, {
            actorId: 'workspace-purge-job',
            action: AuditAction.WORKSPACE_PURGED,
            entityType: AuditEntityType.WORKSPACE,
            entityId: workspace.id,
            workspaceId: workspace.id,
            metadata: {
              slackTeamId: workspace.slackTeamId,
              uninstalledAt: workspace.uninstalledAt,
              purgedAfterDays: this.graceDays,
            },
          });

          await transaction.slackWorkspace.delete({ where: { id: workspace.id } });
        });

        purgedCount += 1;
      } catch (error) {
        // One workspace's failure must never abort the rest of the sweep (same defensive shape
        // as SchedulerService.runTick's per-subscriber loop).
        this.logger.error({
          event: 'workspace_purge_failed',
          workspaceId: workspace.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log({
      event: 'workspace_purge_swept',
      candidateCount: candidates.length,
      purgedCount,
    });
  }
}
