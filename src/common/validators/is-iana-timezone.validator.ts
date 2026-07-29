import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Same probe the environment validation uses: ask `Intl` to format with the zone and see whether
 * it objects. PLAN.md §6.5 requires IANA names, never fixed UTC offsets, so that daylight-saving
 * transitions are handled by the platform database rather than by arithmetic.
 */
export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function IsIanaTimeZone(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown): boolean => isIanaTimeZone(value),
        defaultMessage: (args: ValidationArguments): string =>
          `${args.property} must be a valid IANA time zone`,
      },
    });
  };
}
