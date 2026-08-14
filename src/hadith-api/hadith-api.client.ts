import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hasText } from '../common/utils/text';
import type { AppEnvironment } from '../config/env.validation';
import {
  normalizeHadithApiHttpError,
  normalizeHadithApiNetworkError,
} from './hadith-api-error.mapper';
import { hadithApiNotConfigured, hadithApiRequestFailed } from './hadith-api.errors';
import type { BookSlug, HadithStatus } from './hadith-collections';

const API_BASE = 'https://hadithapi.com';
const REQUEST_TIMEOUT_MS = 10_000;

// HadithImportCursor persists {page, itemIndex} relative to this page size — changing it later
// would silently desync every already-stored cursor from the API's actual pagination, so this
// must stay a fixed constant, never a request parameter or env var.
const PAGE_SIZE = 100;

export interface RawHadithBook {
  id: number;
  bookName: string;
  writerName?: string | null;
  bookSlug: string;
}

export interface RawHadithChapter {
  id: number;
  chapterNumber: number;
  chapterArabic?: string | null;
  chapterEnglish?: string | null;
  bookSlug: string;
}

export interface RawHadith {
  id: number;
  hadithNumber: string;
  englishNarrator?: string | null;
  hadithEnglish?: string | null;
  hadithArabic?: string | null;
  bookSlug: string;
  volume?: number | null;
  status: string;
  book?: RawHadithBook | null;
  chapter?: RawHadithChapter | null;
}

export interface HadithApiPage {
  data: RawHadith[];
  lastPage: number;
}

interface RawHadithListResponse {
  hadiths?: {
    data?: unknown;
    last_page?: number;
  };
}

function isRawHadithArray(value: unknown): value is RawHadith[] {
  return Array.isArray(value);
}

/**
 * Thin wrapper over hadithapi.com's `/api/hadiths` endpoint (docs: https://hadithapi.com/docs/hadiths).
 * Called only from the admin-triggered import path (`HadithImportService`) — never from the
 * delivery scheduler (PLAN.md §2.1).
 *
 * Unlike Quran.Foundation's OAuth2 client_credentials flow, this API authenticates with a single
 * static `apiKey` query-string parameter — there is no token to cache or refresh, so (unlike
 * `QuranFoundationClient`) this client has no companion token service and no retry-on-401 logic:
 * a 401/403 here means the key itself is wrong, which a retry cannot fix.
 */
@Injectable()
export class HadithApiClient {
  private readonly logger = new Logger(HadithApiClient.name);
  private readonly apiKey?: string;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.apiKey = config.get('HADITH_API_KEY', { infer: true });
  }

  isConfigured(): boolean {
    return hasText(this.apiKey);
  }

  /** Fetches one page of hadiths for a given book/status combo. A combo with zero matches
   * returns HTTP 404 on this API (verified live against a real book/status pair with no Hasan
   * entries) — normalized here to an empty page rather than an exception, since "no hadiths at
   * this position" is a normal outcome of the import walk, not a failure. */
  async getHadithPage(
    bookSlug: BookSlug,
    status: HadithStatus,
    page: number,
  ): Promise<HadithApiPage> {
    if (!hasText(this.apiKey)) {
      throw hadithApiNotConfigured();
    }

    const params = new URLSearchParams({
      apiKey: this.apiKey,
      book: bookSlug,
      status,
      page: String(page),
      paginate: String(PAGE_SIZE),
    });

    let response: Response;

    try {
      // Never log the assembled URL — it carries the API key in the query string, unlike
      // Quran.Foundation's header-based credential.
      response = await fetch(`${API_BASE}/api/hadiths?${params.toString()}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw hadithApiRequestFailed(normalizeHadithApiNetworkError());
    }

    if (response.status === 404) {
      return { data: [], lastPage: 0 };
    }

    if (!response.ok) {
      throw hadithApiRequestFailed(normalizeHadithApiHttpError(response));
    }

    const body = (await response.json()) as RawHadithListResponse;
    const data = body.hadiths?.data;

    if (!isRawHadithArray(data)) {
      this.logger.error('hadithapi.com returned an unexpected response shape for /api/hadiths.');
      throw hadithApiRequestFailed({
        code: 'invalid_response_shape',
        message: 'hadithapi.com returned an unexpected response shape.',
        retryable: false,
      });
    }

    return { data, lastPage: body.hadiths?.last_page ?? 0 };
  }
}
