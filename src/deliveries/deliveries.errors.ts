import { ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';

export function deliveryNotFound(id: string): NotFoundException {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    code: 'DELIVERY_NOT_FOUND',
    message: `Delivery "${id}" was not found.`,
  });
}

export function runNotFound(id: string): NotFoundException {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    code: 'DELIVERY_RUN_NOT_FOUND',
    message: `Delivery run "${id}" was not found.`,
  });
}

export function deliveryNotRetryable(id: string): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: 'DELIVERY_NOT_RETRYABLE',
    message: `Delivery "${id}" is not in a retryable state.`,
  });
}

export function deliveryAlreadyResolved(id: string): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: 'DELIVERY_ALREADY_RESOLVED',
    message: `Delivery "${id}" has already been sent or skipped.`,
  });
}
