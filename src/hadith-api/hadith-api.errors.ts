import { HttpException, HttpStatus } from '@nestjs/common';
import type { NormalizedHadithApiError } from './hadith-api-error.mapper';

/** Carries the normalized failure alongside the HTTP response body, mirroring
 * `QuranFoundationOperationException`. */
export class HadithApiOperationException extends HttpException {
  constructor(
    status: number,
    body: { statusCode: number; code: string; message: string; details?: unknown },
    readonly normalized: NormalizedHadithApiError,
  ) {
    super(body, status);
  }
}

const NOT_CONFIGURED: NormalizedHadithApiError = {
  code: 'not_configured',
  message: 'hadithapi.com credentials are not configured.',
  retryable: false,
};

/**
 * `HADITH_API_KEY` is optional so the application boots and every other route keeps working
 * without it. Import operations fail here, at call time, with a clear 503 rather than at
 * startup — same graceful-degradation pattern as `quranFoundationNotConfigured()`.
 */
export function hadithApiNotConfigured(): HadithApiOperationException {
  return new HadithApiOperationException(
    HttpStatus.SERVICE_UNAVAILABLE,
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'HADITH_API_NOT_CONFIGURED',
      message: 'hadithapi.com is not configured. Set HADITH_API_KEY.',
    },
    NOT_CONFIGURED,
  );
}

export function hadithApiRequestFailed(
  normalized: NormalizedHadithApiError,
): HadithApiOperationException {
  const status = normalized.retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY;

  return new HadithApiOperationException(
    status,
    {
      statusCode: status,
      code: 'HADITH_API_REQUEST_FAILED',
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
