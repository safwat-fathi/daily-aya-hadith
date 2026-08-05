import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/env.validation';
import type { Clock } from './clock';

const SECOND_MS = 1000;

/**
 * Real time, optionally shifted by `CLOCK_OFFSET_SECONDS`.
 *
 * The offset exists so per-subscriber scheduling can be verified without waiting: advancing the
 * clock 26 hours is the only practical way to watch a delivery cycle cross a calendar boundary
 * when the project carries no test tooling (PLAN.md §17).
 *
 * It is a deliberate footgun, so it is guarded twice: the environment schema refuses a non-zero
 * offset when `NODE_ENV=production`, and a non-zero offset is announced loudly at startup so it
 * cannot be left set by accident in a development environment.
 */
@Injectable()
export class SystemClock implements Clock {
  private readonly logger = new Logger(SystemClock.name);
  private readonly offsetMs: number;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.offsetMs = config.get('CLOCK_OFFSET_SECONDS', { infer: true }) * SECOND_MS;

    if (this.offsetMs !== 0) {
      this.logger.warn(
        `Clock is offset by ${this.offsetMs / SECOND_MS}s; every scheduling decision uses this shifted time. Unset CLOCK_OFFSET_SECONDS to return to real time.`,
      );
    }
  }

  now(): Date {
    return this.offsetMs === 0 ? new Date() : new Date(Date.now() + this.offsetMs);
  }
}
