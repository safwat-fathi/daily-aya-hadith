export interface NormalizedHadithApiError {
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
  rawStatusCode?: number;
}

function parseRetryAfter(headers: Headers): number | undefined {
  const value = Number(headers.get('retry-after'));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Turns a non-2xx `fetch` Response from HadeethEnc into the fixed shape the import service
 * stores and reports, mirroring `normalizeQuranFoundationHttpError`. HadeethEnc requires no
 * credential of any kind (verified live against every endpoint), so unlike the deleted
 * hadithapi.com mapper there is no dedicated 401/403 branch — an unexpected 401/403 (never
 * observed live; e.g. a WAF/bot block) falls through to the generic non-retryable branch below.
 * Also does NOT special-case 404 — verified live that an out-of-range page returns HTTP 200 with
 * an empty `data` array, not a 404, so the client never needs to treat a status code as "empty
 * page" the way the old one did. */
export function normalizeHadithApiHttpError(response: Response): NormalizedHadithApiError {
  const status = response.status;

  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'HadeethEnc is rate limiting this client.',
      retryable: true,
      retryAfterSeconds: parseRetryAfter(response.headers),
      rawStatusCode: status,
    };
  }

  if (status >= 500) {
    return {
      code: `http_${status}`,
      message: 'HadeethEnc reported a server error.',
      retryable: true,
      rawStatusCode: status,
    };
  }

  return {
    code: `http_${status}`,
    message: 'HadeethEnc rejected the request.',
    retryable: false,
    rawStatusCode: status,
  };
}

/** Network failures, DNS problems and client-side timeouts — `fetch` throws for these rather
 * than returning a Response. */
export function normalizeHadithApiNetworkError(): NormalizedHadithApiError {
  return {
    code: 'network_error',
    message: 'The HadeethEnc API could not be reached.',
    retryable: true,
  };
}
