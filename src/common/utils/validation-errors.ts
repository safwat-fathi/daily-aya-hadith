import type { ValidationError } from 'class-validator';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownErrors = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    const childErrors = flattenValidationErrors(error.children ?? [], field);
    return [...ownErrors, ...childErrors];
  });
}
