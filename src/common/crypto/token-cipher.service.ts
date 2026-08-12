import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../../config/env.validation';
import { hasText } from '../utils/text';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Encrypts Slack bot tokens at rest for OAuth-installed workspaces, which — unlike the
 * env-configured workspace (PLAN.md §5.10) — receive a real token dynamically and have nowhere
 * else to keep it. The env-held key preserves §5.10's original goal (no live credential in a
 * database export) even though the token itself must now live in the database.
 */
@Injectable()
export class TokenCipherService {
  private readonly logger = new Logger(TokenCipherService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService<AppEnvironment, true>) {
    const encoded = config.get('SLACK_TOKEN_ENCRYPTION_KEY', { infer: true });

    if (!hasText(encoded)) {
      this.key = null;
      this.logger.warn(
        'SLACK_TOKEN_ENCRYPTION_KEY is not set; OAuth-installed Slack workspaces cannot be stored.',
      );
      return;
    }

    const decoded = Buffer.from(encoded, 'base64');

    if (decoded.length !== KEY_BYTES) {
      throw new Error(
        `SLACK_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes of base64; got ${decoded.length}.`,
      );
    }

    this.key = decoded;
  }

  isConfigured(): boolean {
    return this.key !== null;
  }

  /** Returns `iv.authTag.ciphertext`, each segment base64url-encoded. */
  encrypt(plaintext: string): string {
    const key = this.requireKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv, authTag, ciphertext].map((part) => part.toString('base64url')).join('.');
  }

  decrypt(payload: string): string {
    const key = this.requireKey();
    const parts = payload.split('.');

    if (parts.length !== 3) {
      throw new Error('Malformed token ciphertext: expected iv.authTag.ciphertext.');
    }

    const [ivPart, authTagPart, ciphertextPart] = parts;
    const iv = Buffer.from(ivPart, 'base64url');
    const authTag = Buffer.from(authTagPart, 'base64url');
    const ciphertext = Buffer.from(ciphertextPart, 'base64url');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  private requireKey(): Buffer {
    if (this.key === null) {
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'TOKEN_ENCRYPTION_NOT_CONFIGURED',
          message: 'SLACK_TOKEN_ENCRYPTION_KEY is not configured.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return this.key;
  }
}
