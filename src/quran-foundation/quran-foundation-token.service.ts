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

const TOKEN_HOSTS = {
  prelive: 'https://prelive-oauth2.quran.foundation',
  production: 'https://oauth2.quran.foundation',
} as const;

const REQUEST_TIMEOUT_MS = 10_000;

// The API issues no refresh token and the access token lives 3600s; refreshing this long before
// the real expiry means an in-flight import batch never hits a token that expires mid-request.
const EARLY_REFRESH_SECONDS = 60;

interface TokenResponseBody {
  access_token: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: Date;
}

/**
 * OAuth2 client_credentials grant against Quran.Foundation's Content API (`scope=content`).
 * Server-to-server only — no user, no PKCE. Mirrors `SlackClientFactory` in spirit: credentials
 * are optional so the app boots without them, and the token itself never leaves this class.
 */
@Injectable()
export class QuranFoundationTokenService {
  private readonly logger = new Logger(QuranFoundationTokenService.name);
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly tokenUrl: string;
  private cached: CachedToken | null = null;

  constructor(
    config: ConfigService<AppEnvironment, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.clientId = config.get('QURAN_FOUNDATION_CLIENT_ID', { infer: true });
    this.clientSecret = config.get('QURAN_FOUNDATION_CLIENT_SECRET', { infer: true });
    this.tokenUrl = `${TOKEN_HOSTS[config.get('QURAN_FOUNDATION_ENV', { infer: true })]}/oauth2/token`;

    if (!this.isConfigured()) {
      this.logger.warn(
        'Quran.Foundation is not configured; imports will fail until QURAN_FOUNDATION_CLIENT_ID and QURAN_FOUNDATION_CLIENT_SECRET are both set.',
      );
    }
  }

  isConfigured(): boolean {
    return hasText(this.clientId) && hasText(this.clientSecret);
  }

  /** Returns a cached, still-valid access token, or fetches a new one. */
  async getAccessToken(): Promise<string> {
    if (!hasText(this.clientId) || !hasText(this.clientSecret)) {
      throw quranFoundationNotConfigured();
    }

    if (this.cached && this.cached.expiresAt > this.clock.now()) {
      return this.cached.accessToken;
    }

    this.cached = await this.requestToken(this.clientId, this.clientSecret);
    return this.cached.accessToken;
  }

  /** Called by the client after a 401: drop the cache and fetch a fresh token. */
  async refresh(): Promise<string> {
    this.cached = null;
    return this.getAccessToken();
  }

  private async requestToken(clientId: string, clientSecret: string): Promise<CachedToken> {
    let response: Response;

    try {
      response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=content',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw quranFoundationRequestFailed(normalizeQuranFoundationNetworkError());
    }

    if (!response.ok) {
      throw quranFoundationRequestFailed(normalizeQuranFoundationHttpError(response));
    }

    const body = (await response.json()) as TokenResponseBody;
    const ttlSeconds = Math.max(0, body.expires_in - EARLY_REFRESH_SECONDS);

    return {
      accessToken: body.access_token,
      expiresAt: new Date(this.clock.now().getTime() + ttlSeconds * 1000),
    };
  }
}
