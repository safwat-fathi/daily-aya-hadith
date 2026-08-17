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
