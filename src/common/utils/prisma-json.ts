import { Prisma } from '../../generated/prisma/client';

/**
 * Prisma deliberately excludes `null` from `InputJsonValue`, because a top-level
 * null has to be written as `Prisma.JsonNull` (or `Prisma.DbNull` on a nullable
 * column) rather than a bare `null`. Nested nulls are unaffected: `InputJsonObject`
 * values and `InputJsonArray` elements are both `InputJsonValue | null`, so this
 * recursion preserves them as-is.
 */
function toJsonInput(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonInput(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toJsonInput(item)]),
    );
  }

  throw new TypeError('Value cannot be represented as JSON.');
}

/**
 * Entry point for writing to a non-nullable `Json` column. Rejects anything that
 * is not a plain object, so callers cannot accidentally store a top-level null,
 * array, or primitive where an object is expected.
 */
export function toInputJsonObject(value: unknown): Prisma.InputJsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Value must be a JSON object.');
  }

  return toJsonInput(value) as Prisma.InputJsonObject;
}

/**
 * Maps a JSON value read back from the database into a write input. A stored
 * JSON null reads as `null` but must be written back as `Prisma.JsonNull`.
 */
export function toJsonFieldInput(
  value: Prisma.JsonValue,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }

  return value;
}
