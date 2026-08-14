import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SchedulerLockService } from '../scheduler/scheduler.lock';
import { WorkspacePurgeService } from './workspace-purge.service';

/**
 * Depends on `SchedulerRegistry` (from `@nestjs/schedule`), which `SchedulerModule` already
 * makes available app-wide via its own `ScheduleModule.forRoot()` — that call registers a
 * `global: true` dynamic module, so it must not be repeated here; `SchedulerRegistry` is already
 * injectable without re-importing `ScheduleModule`.
 */
@Module({
  imports: [AuditModule],
  providers: [WorkspacePurgeService, SchedulerLockService],
})
export class WorkspacePurgeModule {}
