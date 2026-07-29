import {
  WebAPIHTTPError,
  WebAPIPlatformError,
  WebAPIRateLimitedError,
  WebAPIRequestError,
} from '@slack/web-api';

/** PLAN.md §12.4. */
export interface NormalizedSlackError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  rawStatusCode?: number;
}

/**
 * PLAN.md §5.17. Permanent failures are configuration or content problems: retrying them
 * changes nothing and only adds load.
 */
const PERMANENT_CODES = new Set([
  'account_inactive',
  'channel_not_found',
  'invalid_arguments',
  'invalid_auth',
  'invalid_blocks',
  'invalid_blocks_format',
  'is_archived',
  'missing_scope',
  'msg_too_long',
  'no_permission',
  'not_authed',
  'not_in_channel',
  'restricted_action',
  'team_access_not_granted',
  'token_expired',
  'token_revoked',
]);

const RETRYABLE_CODES = new Set([
  'fatal_error',
  'internal_error',
  'ratelimited',
  'request_timeout',
  'service_unavailable',
]);

/**
 * Human-written messages keyed by normalized code. Slack's own error text is never forwarded:
 * `WebAPIPlatformError.data` carries the full API response including echoed request fields, and
 * `WebAPIHTTPError.body` can echo the request itself (PLAN.md §12.4 "never store the full raw
 * response if it can expose secrets").
 */
const MESSAGES: Record<string, string> = {
  account_inactive: 'The Slack bot account is inactive.',
  channel_not_found: 'Slack does not recognize that channel.',
  fatal_error: 'Slack reported a fatal error.',
  internal_error: 'Slack reported an internal error.',
  invalid_arguments: 'Slack rejected the request arguments.',
  invalid_auth: 'The Slack token was rejected.',
  invalid_blocks: 'Slack rejected the message blocks.',
  invalid_blocks_format: 'Slack rejected the message block format.',
  is_archived: 'The Slack channel is archived.',
  missing_scope: 'The Slack token is missing a required scope.',
  msg_too_long: 'The rendered message exceeds Slack size limits.',
  network_error: 'The Slack API could not be reached.',
  no_permission: 'The Slack bot lacks permission for that action.',
  not_authed: 'No Slack token was sent with the request.',
  not_in_channel: 'The Slack bot has not been invited to that channel.',
  ratelimited: 'Slack is rate limiting this workspace.',
  request_timeout: 'The Slack API request timed out.',
  restricted_action: 'Workspace settings prevent that action.',
  service_unavailable: 'The Slack API is temporarily unavailable.',
  team_access_not_granted: 'The token does not grant access to that workspace.',
  token_expired: 'The Slack token has expired.',
  token_revoked: 'The Slack token has been revoked.',
  unknown_error: 'The Slack API call failed.',
};

function messageFor(code: string): string {
  return MESSAGES[code] ?? MESSAGES.unknown_error;
}

function parseRetryAfter(headers: Record<string, string>): number | undefined {
  const value = Number(headers['retry-after']);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Turns any error thrown by `@slack/web-api` into the fixed shape the rest of the application
 * stores and reports. Unknown platform codes are treated as **permanent**: retrying an error we
 * do not understand would hammer Slack, whereas marking it permanent surfaces it to a human.
 */
export function normalizeSlackError(error: unknown): NormalizedSlackError {
  if (error instanceof WebAPIPlatformError) {
    const code = error.data.error;
    return {
      code,
      message: messageFor(code),
      retryable: RETRYABLE_CODES.has(code) && !PERMANENT_CODES.has(code),
    };
  }

  if (error instanceof WebAPIRateLimitedError) {
    return {
      code: 'ratelimited',
      message: messageFor('ratelimited'),
      retryable: true,
      retryAfterSeconds: error.retryAfter,
    };
  }

  if (error instanceof WebAPIHTTPError) {
    const retryable = error.statusCode === 429 || error.statusCode >= 500;
    return {
      code: `http_${error.statusCode}`,
      message: retryable
        ? messageFor('service_unavailable')
        : 'Slack rejected the request with an HTTP error.',
      retryable,
      retryAfterSeconds: parseRetryAfter(error.headers),
      rawStatusCode: error.statusCode,
    };
  }

  // Network failures, DNS problems and client-side timeouts.
  if (error instanceof WebAPIRequestError) {
    return { code: 'network_error', message: messageFor('network_error'), retryable: true };
  }

  return { code: 'unknown_error', message: messageFor('unknown_error'), retryable: false };
}
