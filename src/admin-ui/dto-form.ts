import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { flattenValidationErrors } from '../common/utils/validation-errors';

export type FormValidationResult<T> = { ok: true; dto: T } | { ok: false; message: string };

/**
 * UI controllers call services directly instead of going through the JSON API's `@Body()`
 * pipeline, so this replicates what the global `ValidationPipe` would have done — same DTO
 * classes, same `whitelist`/`forbidNonWhitelisted` behavior — but returns a flash-friendly
 * message instead of throwing, since a thrown `BadRequestException` would hit
 * `AllExceptionsFilter` and produce a raw JSON response instead of a redirect.
 */
export async function validateFormDto<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
): Promise<FormValidationResult<T>> {
  const instance = plainToInstance(cls, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    const message = flattenValidationErrors(errors)
      .map((detail) => `${detail.field}: ${detail.message}`)
      .join('; ');
    return { ok: false, message };
  }

  return { ok: true, dto: instance };
}
