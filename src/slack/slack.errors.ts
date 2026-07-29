import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import type { NormalizedSlackError } from './slack-error.mapper';

/**
 * Carries the normalized Slack failure alongside the HTTP response body.
 *
 * HTTP callers get the usual normalized envelope from `AllExceptionsFilter` with no filter
 * changes, while the Phase 4 delivery orchestrator catches this class and reads `normalized`
 * to populate `ContentDelivery.errorCode`, `errorMessage`, `isRetryable` and `nextRetryAt` —
 * without having to infer retryability back out of an HTTP status code.
 */
export class SlackOperationException extends HttpException {
  constructor(
    status: number,
    body: { statusCode: number; code: string; message: string; details?: unknown },
    readonly normalized: NormalizedSlackError,
  ) {
    super(body, status);
  }
}

const NOT_CONFIGURED: NormalizedSlackError = {
  code: 'not_configured',
  message: 'Slack credentials are not configured.',
  retryable: false,
};

/**
 * `SLACK_BOT_TOKEN` and `SLACK_TOKEN_SECRET_KEY` are optional so the application boots and
 * serves content without a Slack app. Slack operations therefore fail here, at call time, with
 * a code that is not in PLAN.md §18.2's list precisely because that list assumes a token exists.
 */
export function slackNotConfigured(tokenSecretKey: string): SlackOperationException {
  return new SlackOperationException(
    HttpStatus.SERVICE_UNAVAILABLE,
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'SLACK_NOT_CONFIGURED',
      message:
        'Slack is not configured. Set SLACK_BOT_TOKEN and SLACK_TOKEN_SECRET_KEY, and make sure the workspace token alias matches.',
      details: { tokenSecretKey, retryable: false },
    },
    NOT_CONFIGURED,
  );
}

export function slackTokenInvalid(normalized: NormalizedSlackError): SlackOperationException {
  return new SlackOperationException(
    HttpStatus.BAD_GATEWAY,
    {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'SLACK_TOKEN_INVALID',
      message: normalized.message,
      details: { reason: normalized.code, retryable: normalized.retryable },
    },
    normalized,
  );
}

/** Stops a token for one workspace being verified against another workspace's record. */
export function slackTokenWorkspaceMismatch(expected: string, actual: string): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: 'SLACK_TOKEN_WORKSPACE_MISMATCH',
    message: 'The configured Slack token belongs to a different workspace.',
    details: { expectedTeamId: expected, actualTeamId: actual },
  });
}

export function slackChannelInaccessible(
  channelId: string,
  normalized: NormalizedSlackError,
): SlackOperationException {
  return new SlackOperationException(
    HttpStatus.UNPROCESSABLE_ENTITY,
    {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'SLACK_CHANNEL_INACCESSIBLE',
      message: normalized.message,
      details: { channelId, reason: normalized.code, retryable: normalized.retryable },
    },
    normalized,
  );
}

export function slackSendFailed(normalized: NormalizedSlackError): SlackOperationException {
  const status = normalized.retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;

  return new SlackOperationException(
    status,
    {
      statusCode: status,
      code: 'SLACK_SEND_FAILED',
      message: normalized.message,
      details: {
        reason: normalized.code,
        retryable: normalized.retryable,
        retryAfterSeconds: normalized.retryAfterSeconds,
      },
    },
    normalized,
  );
}

export function workspaceInactive(id: string): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: 'WORKSPACE_INACTIVE',
    message: `Workspace "${id}" is inactive.`,
  });
}
