import { ConflictException, HttpStatus, NotFoundException } from '@nestjs/common';

export function workspaceNotFound(id: string): NotFoundException {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    code: 'WORKSPACE_NOT_FOUND',
    message: `Workspace "${id}" was not found.`,
  });
}

export function workspaceAlreadyExists(slackTeamId: string): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    code: 'WORKSPACE_ALREADY_EXISTS',
    message: `A workspace for Slack team "${slackTeamId}" already exists.`,
  });
}
