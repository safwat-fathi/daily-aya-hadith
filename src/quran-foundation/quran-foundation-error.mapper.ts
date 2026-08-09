export interface NormalizedQuranFoundationError {
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

/** Turns a non-2xx `fetch` Response from Quran.Foundation into the fixed shape the import
 * service stores and reports, mirroring `normalizeSlackError` in `src/slack/`. */
export function normalizeQuranFoundationHttpError(
  response: Response,
): NormalizedQuranFoundationError {
  const status = response.status;

  if (status === 401) {
    return {
      code: 'unauthorized',
      message: 'The Quran.Foundation access token was rejected.',
      retryable: true,
      rawStatusCode: status,
    };
  }

  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'Quran.Foundation is rate limiting this client.',
      retryable: true,
      retryAfterSeconds: parseRetryAfter(response.headers),
      rawStatusCode: status,
    };
  }

  if (status >= 500) {
    return {
      code: `http_${status}`,
      message: 'Quran.Foundation reported a server error.',
      retryable: true,
      rawStatusCode: status,
    };
  }

  return {
    code: `http_${status}`,
    message: 'Quran.Foundation rejected the request.',
    retryable: false,
    rawStatusCode: status,
  };
}

/** Network failures, DNS problems and client-side timeouts — `fetch` throws for these rather
 * than returning a Response. */
export function normalizeQuranFoundationNetworkError(): NormalizedQuranFoundationError {
  return {
    code: 'network_error',
    message: 'The Quran.Foundation API could not be reached.',
    retryable: true,
  };
}
