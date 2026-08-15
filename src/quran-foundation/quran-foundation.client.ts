import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CLOCK, type Clock } from '../common/clock/clock';
import { hasText } from '../common/utils/text';
import type { AppEnvironment } from '../config/env.validation';
import {
  normalizeQuranFoundationHttpError,
  normalizeQuranFoundationNetworkError,
} from './quran-foundation-error.mapper';
import {
  quranFoundationNotConfigured,
  quranFoundationRequestFailed,
} from './quran-foundation.errors';
import { QuranFoundationTokenService } from './quran-foundation-token.service';

const API_HOSTS = {
  prelive: 'https://apis-prelive.quran.foundation',
  production: 'https://apis.quran.foundation',
} as const;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_WORD_MEANINGS = 50;

// Resource lists (translations, tafsirs) change essentially never — caching avoids re-fetching
// 100+ entries on every admin page load.
const RESOURCE_LIST_CACHE_TTL_MS = 60 * 60 * 1000;

export interface QuranFoundationWord {
  arabicText: string;
  translation?: string;
}

export interface QuranFoundationVerse {
  surahNumber: number;
  ayahNumber: number;
  arabicText: string;
  translation?: string;
  tafsir?: string;
  words: QuranFoundationWord[];
}

export interface VerseOverrides {
  /** `''` means "no translation", matching the env-config convention. Omit the key entirely
   * (not `undefined` inside a present overrides object — the key itself absent) to fall back to
   * the configured default. */
  translationResourceId?: string;
  tafsirResourceId?: string;
  /** Whether to request word-by-word data at all. Default `true`. */
  includeWords?: boolean;
}

export interface QuranFoundationResource {
  id: string;
  name: string;
  authorName?: string;
  languageName: string;
}

interface RawQuranFoundationWord {
  text_uthmani?: string;
  char_type_name?: string;
  translation?: { text?: string };
}

interface RawQuranFoundationVerse {
  text_uthmani?: string;
  translations?: { text?: string }[];
  tafsirs?: { text?: string }[];
  words?: RawQuranFoundationWord[];
}

interface RawVerseResponse {
  verse: RawQuranFoundationVerse;
}

interface RawResource {
  id: number;
  name: string;
  author_name?: string | null;
  language_name: string;
}

interface CachedResourceList {
  data: QuranFoundationResource[];
  expiresAt: Date;
}

function parseVerse(
  raw: RawQuranFoundationVerse,
  surahNumber: number,
  ayahNumber: number,
): QuranFoundationVerse {
  const words = (raw.words ?? [])
    // "end" markers are the ayah-end glyph, not a word — Quran.com-family APIs include them
    // in the `words` array so verse text can be reconstructed word-by-word.
    .filter((word) => word.char_type_name !== 'end')
    .slice(0, MAX_WORD_MEANINGS)
    .map((word) => ({
      arabicText: word.text_uthmani ?? '',
      translation: word.translation?.text,
    }));

  return {
    surahNumber,
    ayahNumber,
    arabicText: raw.text_uthmani ?? '',
    translation: raw.translations?.[0]?.text,
    tafsir: raw.tafsirs?.[0]?.text,
    words,
  };
}

function parseResourceList(raw: RawResource[]): QuranFoundationResource[] {
  return raw.map((item) => ({
    id: String(item.id),
    name: item.name,
    authorName: item.author_name ?? undefined,
    languageName: item.language_name,
  }));
}

/**
 * Thin wrapper over the Quran.Foundation Content API v4 (`/content/api/v4`). Called only from
 * the admin-triggered import path (`QuranImportService`) — never from the delivery scheduler
 * (PLAN.md §2.1).
 *
 * The verse-fetch path/params below follow the documented OAuth2 client_credentials flow and
 * the legacy Quran.com v4 response shape this API is built on. The docs site renders via
 * client-side JS and didn't yield field-level reference during setup, so confirm this against
 * one real, credentialed response (see plan step 0) before relying on it in production — adjust
 * `parseVerse` and the query params here if the live shape differs.
 *
 * `?language=` on the resources endpoints was tested live and does **not** filter server-side
 * (confirmed: `?language=ar` and `?language=arabic` both returned the full unfiltered list) —
 * any language filtering of `listTranslations()`/`listTafsirs()` results must happen in the
 * caller, grouping by each resource's own `languageName`. Word-by-word (`words=true`) glosses
 * were also confirmed live to have no language control at all — every candidate parameter
 * (`word_translation_language`, `word_lang`, `words_language`, `language`, `word_translation_id`,
 * `translations`, `word_by_word_translation`) left the English gloss unchanged, so word meanings
 * only support an on/off toggle (`VerseOverrides.includeWords`), never a language choice.
 */
@Injectable()
export class QuranFoundationClient {
  private readonly logger = new Logger(QuranFoundationClient.name);
  private readonly clientId?: string;
  private readonly apiBase: string;
  private readonly translationResourceId?: string;
  private readonly tafsirResourceId?: string;
  private translationsCache: CachedResourceList | null = null;
  private tafsirsCache: CachedResourceList | null = null;

  constructor(
    config: ConfigService<AppEnvironment, true>,
    private readonly tokens: QuranFoundationTokenService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.clientId = config.get('QURAN_FOUNDATION_CLIENT_ID', { infer: true });
    this.apiBase = API_HOSTS[config.get('QURAN_FOUNDATION_ENV', { infer: true })];
    this.translationResourceId = config.get('QURAN_FOUNDATION_TRANSLATION_RESOURCE_ID', {
      infer: true,
    });
    this.tafsirResourceId = config.get('QURAN_FOUNDATION_TAFSIR_RESOURCE_ID', { infer: true });
  }

  isConfigured(): boolean {
    return this.tokens.isConfigured() && hasText(this.clientId);
  }

  /** The env-configured defaults, for the admin UI to pre-select against. */
  getDefaultResourceIds(): { translationResourceId?: string; tafsirResourceId?: string } {
    return {
      translationResourceId: this.translationResourceId,
      tafsirResourceId: this.tafsirResourceId,
    };
  }

  async getVerse(
    surahNumber: number,
    ayahNumber: number,
    overrides?: VerseOverrides,
  ): Promise<QuranFoundationVerse> {
    if (!hasText(this.clientId)) {
      throw quranFoundationNotConfigured();
    }

    const translationId = overrides?.translationResourceId ?? this.translationResourceId;
    const tafsirId = overrides?.tafsirResourceId ?? this.tafsirResourceId;
    const includeWords = overrides?.includeWords ?? true;

    const params = new URLSearchParams({ fields: 'text_uthmani' });

    if (includeWords) {
      params.set('words', 'true');
      params.set('word_fields', 'text_uthmani');
    }

    if (hasText(translationId)) {
      params.set('translations', translationId);
    }

    // tafsirs are no longer returned by the verses/by_key endpoint in API v4
    // We must fetch them from their dedicated endpoint if requested.
    const versePromise = this.request<RawVerseResponse>(
      `/content/api/v4/verses/by_key/${surahNumber}:${ayahNumber}?${params.toString()}`,
    );

    let tafsirPromise: Promise<{ tafsir?: { text?: string } }> = Promise.resolve({});
    if (hasText(tafsirId)) {
      tafsirPromise = this.request<{ tafsir?: { text?: string } }>(
        `/content/api/v4/tafsirs/${tafsirId}/by_ayah/${surahNumber}:${ayahNumber}`,
      ).catch((err) => {
        this.logger.warn(
          `Failed to fetch tafsir ${tafsirId} for ${surahNumber}:${ayahNumber}: ${err.message}`,
        );
        return {};
      });
    }

    const [verseBody, tafsirBody] = await Promise.all([versePromise, tafsirPromise]);

    const parsedVerse = parseVerse(verseBody.verse, surahNumber, ayahNumber);
    if (tafsirBody.tafsir?.text) {
      parsedVerse.tafsir = tafsirBody.tafsir.text;
    }
    return parsedVerse;
  }

  async listTranslations(): Promise<QuranFoundationResource[]> {
    return this.listResources('translations', 'translationsCache');
  }

  async listTafsirs(): Promise<QuranFoundationResource[]> {
    return this.listResources('tafsirs', 'tafsirsCache');
  }

  private async listResources(
    kind: 'translations' | 'tafsirs',
    cacheField: 'translationsCache' | 'tafsirsCache',
  ): Promise<QuranFoundationResource[]> {
    if (!hasText(this.clientId)) {
      throw quranFoundationNotConfigured();
    }

    const cached = this[cacheField];

    if (cached && cached.expiresAt > this.clock.now()) {
      return cached.data;
    }

    const body = await this.request<Record<typeof kind, RawResource[]>>(
      `/content/api/v4/resources/${kind}`,
    );
    const data = parseResourceList(body[kind]);

    this[cacheField] = {
      data,
      expiresAt: new Date(this.clock.now().getTime() + RESOURCE_LIST_CACHE_TTL_MS),
    };

    return data;
  }

  private async request<T>(path: string, isRetryAfterUnauthorized = false): Promise<T> {
    const accessToken = await this.tokens.getAccessToken();
    let response: Response;

    try {
      response = await fetch(`${this.apiBase}${path}`, {
        headers: {
          'x-auth-token': accessToken,
          'x-client-id': this.clientId as string,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw quranFoundationRequestFailed(normalizeQuranFoundationNetworkError());
    }

    if (response.status === 401 && !isRetryAfterUnauthorized) {
      this.logger.warn('Quran.Foundation rejected the access token; refreshing and retrying once.');
      await this.tokens.refresh();
      return this.request<T>(path, true);
    }

    if (!response.ok) {
      throw quranFoundationRequestFailed(normalizeQuranFoundationHttpError(response));
    }

    return (await response.json()) as T;
  }
}
