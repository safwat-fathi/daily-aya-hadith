import { HttpException, HttpStatus } from '@nestjs/common';
import type { NormalizedQuranFoundationError } from './quran-foundation-error.mapper';

/** Carries the normalized failure alongside the HTTP response body, mirroring
 * `SlackOperationException` in `src/slack/slack.errors.ts`. */
export class QuranFoundationOperationException extends HttpException {
  constructor(
    status: number,
    body: { statusCode: number; code: string; message: string; details?: unknown },
    readonly normalized: NormalizedQuranFoundationError,
  ) {
    super(body, status);
  }
}

const NOT_CONFIGURED: NormalizedQuranFoundationError = {
  code: 'not_configured',
  message: 'Quran.Foundation credentials are not configured.',
  retryable: false,
};

/**
 * `QURAN_FOUNDATION_CLIENT_ID`/`QURAN_FOUNDATION_CLIENT_SECRET` are optional so the application
 * boots and every other route keeps working without a Quran.Foundation app. Import operations
 * fail here, at call time, with a clear 503 rather than at startup.
 */
export function quranFoundationNotConfigured(): QuranFoundationOperationException {
  return new QuranFoundationOperationException(
    HttpStatus.SERVICE_UNAVAILABLE,
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'QURAN_FOUNDATION_NOT_CONFIGURED',
      message:
        'Quran.Foundation is not configured. Set QURAN_FOUNDATION_CLIENT_ID and QURAN_FOUNDATION_CLIENT_SECRET.',
    },
    NOT_CONFIGURED,
  );
}

export function quranFoundationRequestFailed(
  normalized: NormalizedQuranFoundationError,
): QuranFoundationOperationException {
  const status = normalized.retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;

  return new QuranFoundationOperationException(
    status,
    {
      statusCode: status,
      code: 'QURAN_FOUNDATION_REQUEST_FAILED',
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
