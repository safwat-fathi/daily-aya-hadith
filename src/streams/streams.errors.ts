import { BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';

export function streamNotFound(id: string): NotFoundException {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    code: 'STREAM_NOT_FOUND',
    message: `Stream "${id}" was not found.`,
  });
}

export function scheduleInvalid(message: string): BadRequestException {
  return new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'SCHEDULE_INVALID',
    message,
  });
}
