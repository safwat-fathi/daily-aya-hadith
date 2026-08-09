import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PLAN.md §7.2/§11.1: an advisory lock to reduce duplicate-tick contention when one tick is
 * still running when the next would fire. Not required for correctness — the `DeliveryRun`/
 * `ContentDelivery` unique constraints already guarantee that (§11.5) — only for avoiding
 * wasted duplicate work.
 *
 * Deliberately transaction-scoped (`pg_try_advisory_xact_lock`), not session-scoped
 * (`pg_try_advisory_lock`): a session lock's acquire and release must land on the same physical
 * connection, which Prisma's pooled `$queryRaw` calls don't guarantee across two separate calls.
 * An xact-scoped lock auto-releases at commit/rollback, so there is no separate release call to
 * get wrong — Prisma pins one connection for an interactive transaction's full duration.
 */
@Injectable()
export class SchedulerLockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` while holding the lock, inside one interactive transaction spanning the whole
   * call. If the lock is already held (a previous tick is still running), `fn` is skipped
   * entirely. `timeoutMs` bounds the whole interactive transaction, which is a soft cap on tick
   * throughput at MVP subscriber counts, not a correctness risk — see the plan's "Known cap on
   * tick duration" note.
   */
  async withLock(lockId: number, fn: () => Promise<void>, timeoutMs = 120_000): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${lockId}) AS locked
        `;

        if (rows[0]?.locked !== true) {
          return;
        }

        await fn();
      },
      { timeout: timeoutMs, maxWait: 5000 },
    );
  }
}
