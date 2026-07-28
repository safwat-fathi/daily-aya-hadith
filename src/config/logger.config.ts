import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import type { AppEnvironment } from './env.validation';

const MAX_REQUEST_ID_LENGTH = 128;

function resolveRequestId(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
): string {
  const header = request.headers['x-request-id'];
  const incoming = Array.isArray(header) ? undefined : header?.trim();
  const requestId = incoming && incoming.length <= MAX_REQUEST_ID_LENGTH ? incoming : randomUUID();

  response.setHeader('x-request-id', requestId);
  return requestId;
}

export function createLoggerConfig(environment: AppEnvironment): Params {
  return {
    forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
    pinoHttp: {
      level: environment.LOG_LEVEL,
      genReqId: resolveRequestId,
      redact: {
        paths: [
          'req.headers.x-admin-key',
          'req.headers.authorization',
          'req.body.adminApiKey',
          'req.body.botToken',
          'req.body.databaseUrl',
          'req.body.token',
        ],
        censor: '[REDACTED]',
      },
      transport:
        environment.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                ignore: 'pid,hostname',
                singleLine: true,
                translateTime: 'SYS:standard',
              },
            }
          : undefined,
    },
  };
}
