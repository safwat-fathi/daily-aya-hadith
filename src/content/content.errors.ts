import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { ContentStatus } from '../generated/prisma/enums';
import type { ValidationErrorDetail } from '../common/utils/validation-errors';

export function contentNotFound(id: string): NotFoundException {
  return new NotFoundException({
    statusCode: 404,
    code: 'CONTENT_NOT_FOUND',
    message: `Content item "${id}" was not found.`,
  });
}

export function invalidStatusTransition(status: ContentStatus, action: string): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'INVALID_STATUS_TRANSITION',
    message: `Content in status ${status} cannot be ${action}.`,
  });
}

export function contentUpdateConflict(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: 'CONTENT_UPDATE_CONFLICT',
    message: 'Content changed after it was loaded. Refresh it and retry.',
  });
}

export function contentValidationFailed(details: ValidationErrorDetail[]): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'CONTENT_VALIDATION_FAILED',
    message: 'Content payload is invalid.',
    details,
  });
}
