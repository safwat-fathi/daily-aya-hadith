import { ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';

export function subscriberNotFound(id: string): NotFoundException {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    code: 'SUBSCRIBER_NOT_FOUND',
    message: `Subscriber "${id}" was not found.`,
  });
}

export function subscriberAlreadyExists(
  workspaceId: string,
  slackUserId: string,
): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: 'SUBSCRIBER_ALREADY_EXISTS',
    message: `User "${slackUserId}" is already subscribed in workspace "${workspaceId}".`,
  });
}
