import { HttpException } from '@nestjs/common';
import type { Request } from 'express';

export type FlashType = 'success' | 'error';

export interface FlashMessage {
  type: FlashType;
  text: string;
}

/** Post-redirect-get feedback: set before a redirect, read (and cleared) on the next render. */
export function setFlash(request: Request, type: FlashType, text: string): void {
  request.session.flash = { type, text };
}

export function readFlash(request: Request): FlashMessage | null {
  const flash = request.session.flash;

  if (flash === undefined) {
    return null;
  }

  delete request.session.flash;
  return flash;
}

interface ErrorPayload {
  message?: unknown;
  details?: unknown;
}

function detailsToText(details: unknown): string | undefined {
  if (!Array.isArray(details)) {
    return undefined;
  }

  const lines = details.map((detail) =>
    typeof detail === 'object' && detail !== null && 'message' in detail
      ? String((detail as { message?: unknown }).message)
      : String(detail),
  );

  return lines.length > 0 ? lines.join('; ') : undefined;
}

/**
 * Mirrors `AllExceptionsFilter`'s extraction so a caught service error reads the same on a flash
 * banner as it would in the JSON API — UI controllers catch and redirect instead of letting the
 * global JSON filter handle it, since that filter always responds with `response.json(...)`.
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const payload =
      typeof response === 'object' && response !== null ? (response as ErrorPayload) : undefined;
    const baseMessage = typeof payload?.message === 'string' ? payload.message : error.message;
    const detailText = detailsToText(payload?.details);

    return detailText ? `${baseMessage}: ${detailText}` : baseMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong.';
}
