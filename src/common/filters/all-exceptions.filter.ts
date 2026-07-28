import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorPayload {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === 'object' && value !== null;
}

function defaultCode(statusCode: number): string {
  if (statusCode === 500) {
    return 'INTERNAL_SERVER_ERROR';
  }

  return 'HTTP_ERROR';
}

function resolveRequestId(request: Request, response: Response): string {
  if (typeof request.id === 'string' || typeof request.id === 'number') {
    return String(request.id);
  }

  return response.getHeader('x-request-id')?.toString() ?? 'unknown';
}

@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = isErrorPayload(exceptionResponse) ? exceptionResponse : undefined;
    const requestId = resolveRequestId(request, response);

    const normalized: NormalizedError = {
      statusCode,
      code: typeof payload?.code === 'string' ? payload.code : defaultCode(statusCode),
      message:
        statusCode === 500
          ? 'Internal server error.'
          : typeof payload?.message === 'string'
            ? payload.message
            : exception instanceof Error
              ? exception.message
              : 'Request failed.',
      requestId,
    };

    if (payload?.details !== undefined) {
      normalized.details = payload.details;
    }

    if (statusCode >= 500) {
      this.logger.error(
        {
          error: exception instanceof Error ? exception.message : 'Unknown error',
          method: request.method,
          requestId,
          url: request.originalUrl,
        },
        'Unhandled request error',
      );
    }

    response.status(statusCode).json(normalized);
  }
}
