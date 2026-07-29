import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogLevel, WebClient } from '@slack/web-api';
import { hasText } from '../common/utils/text';
import type { AppEnvironment } from '../config/env.validation';
import { slackNotConfigured } from './slack.errors';

const REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class SlackClientFactory {
  private readonly logger = new Logger(SlackClientFactory.name);
  /** alias -> token. Empty when Slack is not configured. The token never leaves this class. */
  private readonly tokens: ReadonlyMap<string, string>;
  private readonly clients = new Map<string, WebClient>();

  constructor(config: ConfigService<AppEnvironment, true>) {
    const alias = config.get('SLACK_TOKEN_SECRET_KEY', { infer: true });
    const token = config.get('SLACK_BOT_TOKEN', { infer: true });

    // Both are required. A blank alias with a token set is a misconfiguration, not a fallback:
    // the alias is what `SlackWorkspace.tokenSecretKey` is matched against, so accepting any
    // alias would let a workspace row pointing at a decommissioned credential post with the
    // current token.
    this.tokens = hasText(alias) && hasText(token) ? new Map([[alias, token]]) : new Map();

    if (this.tokens.size === 0) {
      this.logger.warn(
        'Slack is not configured; Slack operations will fail until SLACK_BOT_TOKEN and SLACK_TOKEN_SECRET_KEY are both set.',
      );
    }
  }

  /**
   * Resolves the client for a workspace's token alias, or throws 503 `SLACK_NOT_CONFIGURED`.
   *
   * Failing here rather than at boot is deliberate: both Slack variables are optional, and the
   * content, review and health APIs must keep working on a machine with no Slack app at all
   * (PLAN.md §19.4 expects deployments that cannot post).
   */
  getClient(tokenSecretKey: string): WebClient {
    const token = this.tokens.get(tokenSecretKey);

    if (token === undefined) {
      throw slackNotConfigured(tokenSecretKey);
    }

    const existing = this.clients.get(tokenSecretKey);

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
    this.clients.set(tokenSecretKey, client);

    return client;
  }

  /** Diagnostics only: reports whether a token is present, never any part of its value. */
  isConfigured(): boolean {
    return this.tokens.size > 0;
  }
}
