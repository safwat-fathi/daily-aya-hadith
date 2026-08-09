import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CLOCK, type Clock } from '../common/clock/clock';
import type { AppEnvironment } from '../config/env.validation';
import { DeliveryOrchestratorService } from '../deliveries/delivery-orchestrator.service';
import { StreamsService } from '../streams/streams.service';
import { SchedulerLockService } from './scheduler.lock';

const TICK_INTERVAL_NAME = 'scheduler-tick';

/**
 * PLAN.md §11.1–§11.3. `SCHEDULER_INTERVAL_MINUTES` is a plain number, not a cron expression, so
 * this registers a `setInterval` through `SchedulerRegistry` rather than a cron string — that
 * also avoids pulling in `cron`'s `CronJob` class as an undeclared transitive dependency. Ticks
 * firing at a uniform interval from app start (rather than wall-clock-aligned) is fine: the due
 * window (`schedule-time.ts`) already tolerates ticks that aren't minute-aligned.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly enabled: boolean;
  private readonly intervalMinutes: number;
  private readonly lockId: number;

  constructor(
    config: ConfigService<AppEnvironment, true>,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly streamsService: StreamsService,
    private readonly orchestrator: DeliveryOrchestratorService,
    private readonly lock: SchedulerLockService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.enabled = config.get('SCHEDULER_ENABLED', { infer: true });
    this.intervalMinutes = config.get('SCHEDULER_INTERVAL_MINUTES', { infer: true });
    this.lockId = config.get('SCHEDULER_LOCK_ID', { infer: true });
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Scheduler disabled (SCHEDULER_ENABLED=false).');
      return;
    }

    const interval = setInterval(() => {
      this.tick().catch((error: unknown) => {
        this.logger.error({
          event: 'scheduler_tick_unhandled_error',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.intervalMinutes * 60_000);

    this.schedulerRegistry.addInterval(TICK_INTERVAL_NAME, interval);
    this.logger.log(`Scheduler enabled: ticking every ${this.intervalMinutes} minute(s).`);
  }

  async tick(): Promise<void> {
    await this.lock.withLock(this.lockId, () => this.runTick());
  }

  private async runTick(): Promise<void> {
    const nowUtc = this.clock.now();
    const due = await this.streamsService.findDueStreamSubscribers(nowUtc, this.intervalMinutes);

    this.logger.log({ event: 'scheduler_tick_started', dueCount: due.length });

    for (const { stream, subscriber } of due) {
      try {
        await this.orchestrator.deliverToSubscriber(stream, subscriber, nowUtc);
      } catch (error) {
        // One subscriber's failure must never abort the rest of the tick (§11.3).
        this.logger.error({
          event: 'scheduled_delivery_unhandled_error',
          streamId: stream.id,
          subscriberId: subscriber.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.orchestrator.retrySweep(nowUtc);
  }
}
