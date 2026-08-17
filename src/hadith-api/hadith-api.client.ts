import { Injectable, Logger } from '@nestjs/common';
import {
  normalizeHadithApiHttpError,
  normalizeHadithApiNetworkError,
} from './hadith-api-error.mapper';
import { hadithApiRequestFailed } from './hadith-api.errors';

const API_BASE = 'https://hadeethenc.com/api/v1';
const REQUEST_TIMEOUT_MS = 10_000;

// HadithImportCursor persists {page, itemIndex} relative to this page size — changing it later
// would silently desync every already-stored cursor from the API's actual pagination, so this
// must stay a fixed constant, never a request parameter or env var. Verified live: the API
// honors per_page above its default of 20 (tested up to 100, returning every item in one page).
const PAGE_SIZE = 100;

export type HadeethLanguage = 'ar' | 'en';

/** A HadeethEnc category node. `/categories/list/` returns a FLAT array of every category, not a
 * nested tree — see `hadith-category-walk.ts`. `id`/`hadeeths_count` arrive from the API as JSON
 * strings, not numbers. */
export interface RawCategoryNode {
  id: string;
  title: string;
  hadeeths_count: string | number;
  parent_id: string | null;
}

export interface RawHadeethListItem {
  id: string;
  title: string;
  translations: string[];
}

/** Fields this app actually reads from `/hadeeths/one/` and `/hadeeths/multiple/`. `hadeeth_intro`
 * exists on the real response too but is deliberately never read — see
 * `HADITH_PAYLOAD mapping` notes in `hadith-import.service.ts`. `reference` is only present when
 * `language=ar` was requested — absent entirely from the `language=en` response. */
export interface RawHadeethDetail {
  id: string;
  hadeeth: string;
  attribution?: string;
  grade?: string;
  explanation?: string;
  hints?: string[];
  reference?: string;
}

export interface HadeethListPage {
  data: RawHadeethListItem[];
  lastPage: number;
}

interface RawHadeethListResponse {
  data?: unknown;
  meta?: { last_page?: string | number };
}

/**
 * Thin wrapper over HadeethEnc's (hadeethenc.com) public API (docs:
 * https://documenter.getpostman.com/view/5211979/TVev3j7q, verified live rather than trusted, as
 * the Postman/GitHub docs turned out too thin to build against directly). Called only from the
 * admin-triggered import path (`HadithImportService`) — never from the delivery scheduler
 * (PLAN.md §2.1).
 *
 * Unlike hadithapi.com (a static `apiKey` query param) or Quran.Foundation (OAuth2
 * client_credentials), HadeethEnc requires **no authentication of any kind** — verified live
 * against every endpoint below. There is therefore no `isConfigured()` method and no
 * "not configured" failure mode: every method here can be called immediately.
 */
@Injectable()
export class HadithApiClient {
  private readonly logger = new Logger(HadithApiClient.name);

  private async fetchJson(path: string, params: Record<string, string>): Promise<unknown> {
    const query = new URLSearchParams(params);
    let response: Response;

    try {
      response = await fetch(`${API_BASE}${path}?${query.toString()}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw hadithApiRequestFailed(normalizeHadithApiNetworkError());
    }

    if (!response.ok) {
      throw hadithApiRequestFailed(normalizeHadithApiHttpError(response));
    }

    return response.json();
  }

  private invalidShape(path: string): never {
    this.logger.error(`HadeethEnc returned an unexpected response shape for ${path}.`);
    throw hadithApiRequestFailed({
      code: 'invalid_response_shape',
      message: 'HadeethEnc returned an unexpected response shape.',
      retryable: false,
    });
  }

  /** One call returns the whole category list — no pagination on this endpoint (verified live:
   * 452 categories with hadeeths_count > 0 in one response). */
  async getCategoryTree(language: HadeethLanguage): Promise<RawCategoryNode[]> {
    const body = await this.fetchJson('/categories/list/', { language });

    if (!Array.isArray(body)) {
      this.invalidShape('/categories/list/');
    }

    return body as RawCategoryNode[];
  }

  /** `language` is fixed to `'ar'` here regardless of the caller's eventual detail-fetch language
   * — only `id`/`translations` are read from list rows (both language-independent), never
   * `title`, so there's nothing to gain from requesting `'en'`. Verified live: an out-of-range
   * `page` returns HTTP 200 with `data: []` and an accurate `meta.last_page`, not a 404 or error
   * — unlike the deleted hadithapi.com client, no special empty-page handling is needed here. */
  async getHadeethsPage(categoryId: string, page: number): Promise<HadeethListPage> {
    const body = (await this.fetchJson('/hadeeths/list/', {
      language: 'ar',
      category_id: categoryId,
      page: String(page),
      per_page: String(PAGE_SIZE),
    })) as RawHadeethListResponse;

    if (!Array.isArray(body.data)) {
      this.invalidShape('/hadeeths/list/');
    }

    // meta fields arrive with inconsistent JSON types across this API (e.g. current_page/per_page
    // as strings, last_page sometimes as a number) — cast defensively rather than trust either.
    return { data: body.data as RawHadeethListItem[], lastPage: Number(body.meta?.last_page ?? 0) };
  }

  /** Batch detail fetch — verified live: comma-separated `ids=1,2,3` works and returns the same
   * full field set as `/hadeeths/one/` for every id; `ids[]=` syntax does not work (returns `[]`).
   * Returns an empty Map immediately for an empty `ids` list, with no request. Keyed by each
   * item's own `id` field, not response array position — callers must never assume the response
   * order matches the request order. */
  async getHadeethsMultiple(
    ids: readonly string[],
    language: HadeethLanguage,
  ): Promise<Map<string, RawHadeethDetail>> {
    if (ids.length === 0) {
      return new Map();
    }

    const body = await this.fetchJson('/hadeeths/multiple/', { language, ids: ids.join(',') });

    if (!Array.isArray(body)) {
      this.invalidShape('/hadeeths/multiple/');
    }

    const result = new Map<string, RawHadeethDetail>();
    for (const item of body as RawHadeethDetail[]) {
      result.set(item.id, item);
    }
    return result;
  }
}
