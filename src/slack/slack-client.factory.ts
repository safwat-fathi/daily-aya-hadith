import { Injectable } from '@nestjs/common';
import { LogLevel, WebClient } from '@slack/web-api';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Caches one `WebClient` per workspace, keyed by `workspaceId` rather than by token value, so a
 * reinstall (new token, same workspace) can force a fresh client via `evict`. Without eviction, a
 * reinstalled or uninstalled workspace would keep using a cached client holding a stale or
 * revoked token until the process restarts.
 *
 * Holds no notion of "configured" itself: every workspace resolves its own token independently
 * (`SlackService.resolveWorkspace`), so there is no longer a single global on/off switch.
 */
@Injectable()
export class SlackClientFactory {
  private readonly clients = new Map<string, WebClient>();

  getClientForWorkspace(workspaceId: string, token: string): WebClient {
    const existing = this.clients.get(workspaceId);

    if (existing !== undefined) {
      return existing;
    }

    const client = new WebClient(token, {
      // Retry policy belongs to the delivery records, not the SDK (PLAN.md §5.17 — database
      // timestamps, not a queue).
      retryConfig: { retries: 0 },
      // Without this the SDK silently sleeps through a 429, which hides `retryAfterSeconds`
      // and blocks the request for as long as Slack asks.
      rejectRateLimitedCalls: true,
      timeout: REQUEST_TIMEOUT_MS,
      logLevel: LogLevel.WARN,
    });
    this.clients.set(workspaceId, client);

    return client;
  }

  /** Forces the next `getClientForWorkspace` call for this workspace to build a fresh client. */
  evict(workspaceId: string): void {
    this.clients.delete(workspaceId);
  }
}
