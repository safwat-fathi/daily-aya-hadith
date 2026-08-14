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

/** Turns a non-2xx `fetch` Response from hadithapi.com into the fixed shape the import service
 * stores and reports, mirroring `normalizeQuranFoundationHttpError`. Does NOT handle 404 — a
 * book/status combo with zero matches returns 404 on this API (verified live), which the client
 * treats as an empty page, not an error, so it never reaches this mapper. */
export function normalizeHadithApiHttpError(response: Response): NormalizedHadithApiError {
  const status = response.status;

  if (status === 401 || status === 403) {
    // Unlike Quran.Foundation's OAuth access token (an expiring credential worth retrying after
    // a refresh), HADITH_API_KEY is a static key — a 401/403 means the key itself is wrong or
    // missing, which a retry cannot fix.
    return {
      code: status === 401 ? 'unauthorized' : 'forbidden',
      message:
        status === 401
          ? 'The hadithapi.com API key was rejected as invalid.'
          : 'hadithapi.com rejected the request: API key missing.',
      retryable: false,
      rawStatusCode: status,
    };
  }

  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'hadithapi.com is rate limiting this client.',
      retryable: true,
      retryAfterSeconds: parseRetryAfter(response.headers),
      rawStatusCode: status,
    };
  }

  if (status >= 500) {
    return {
      code: `http_${status}`,
      message: 'hadithapi.com reported a server error.',
      retryable: true,
      rawStatusCode: status,
    };
  }

  return {
    code: `http_${status}`,
    message: 'hadithapi.com rejected the request.',
    retryable: false,
    rawStatusCode: status,
  };
}

/** Network failures, DNS problems and client-side timeouts — `fetch` throws for these rather
 * than returning a Response. */
export function normalizeHadithApiNetworkError(): NormalizedHadithApiError {
  return {
    code: 'network_error',
    message: 'The hadithapi.com API could not be reached.',
    retryable: true,
  };
}
