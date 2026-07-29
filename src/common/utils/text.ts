/**
 * Present-and-not-blank. Accepts `unknown` because renderers apply it to values read out of
 * Prisma `Json` columns, which are only typed as `JsonValue` and may hold anything.
 *
 * The predicate decides *whether* a value is rendered or required. It never transforms the
 * value: callers must emit the original string, not a trimmed copy, so stored religious text
 * survives byte-identical.
 */
export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
