import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/env.validation';
import { hasText } from '../common/utils/text';
import { oauthNotConfigured } from './slack-oauth.errors';

const STATE_TTL_SECONDS = 600;
const HMAC_KEY_BYTES = 32;
/** Domain-separates this key from `TokenCipherService`'s AES key, even though both are derived
 * from the same configured secret (`SLACK_TOKEN_ENCRYPTION_KEY`) via HKDF. */
const HKDF_INFO = Buffer.from('slack-oauth-state-v1');

/**
 * Signs and verifies the OAuth `state` parameter so `/slack/oauth/callback` can reject a request
 * that didn't originate from `/slack/install` (CSRF) or has expired, without needing server-side
 * session storage for anonymous installers.
 */
@Injectable()
export class OauthStateService {
  private readonly hmacKey: Buffer | null;

  constructor(config: ConfigService<AppEnvironment, true>) {
    const encoded = config.get('SLACK_TOKEN_ENCRYPTION_KEY', { infer: true });
    this.hmacKey = hasText(encoded)
      ? Buffer.from(
          hkdfSync(
            'sha256',
            Buffer.from(encoded, 'base64'),
            Buffer.alloc(0),
            HKDF_INFO,
            HMAC_KEY_BYTES,
          ),
        )
      : null;
  }

  issue(): string {
    const key = this.requireKey();
    const nonce = randomBytes(16).toString('base64url');
    const expiresAt = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS;
    return `${nonce}.${expiresAt}.${this.sign(key, nonce, expiresAt)}`;
  }

  verify(state: string): boolean {
    const key = this.requireKey();
    const parts = state.split('.');

    if (parts.length !== 3) {
      return false;
    }

    const [nonce, expiresAtRaw, signature] = parts;
    const expiresAt = Number(expiresAtRaw);

    if (!Number.isFinite(expiresAt) || Math.floor(Date.now() / 1000) > expiresAt) {
      return false;
    }

    const expected = Buffer.from(this.sign(key, nonce, expiresAt));
    const supplied = Buffer.from(signature);

    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  private sign(key: Buffer, nonce: string, expiresAt: number): string {
    return createHmac('sha256', key).update(`${nonce}.${expiresAt}`).digest('base64url');
  }

  private requireKey(): Buffer {
    if (this.hmacKey === null) {
      throw oauthNotConfigured();
    }

    return this.hmacKey;
  }
}
