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
import { Prisma } from '../../generated/prisma/client';

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

interface MappedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Prisma errors are not `HttpException`s, so without this they would all normalize to 500.
 * Raw Prisma messages can name columns and constraints, so each mapping supplies its own
 * message rather than forwarding `exception.message`.
 */
function mapPrismaError(exception: unknown): MappedError | undefined {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }

  switch (exception.code) {
    case 'P2002':
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'RESOURCE_CONFLICT',
        message: 'The request conflicts with an existing record. Reload it and retry.',
      };
    case 'P2034':
      // Serializable transaction lost a write race. The caller can safely resend.
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'TRANSACTION_CONFLICT',
        message: 'The request conflicted with a concurrent change. Retry the request.',
        details: { retryable: true },
      };
    case 'P2003':
      return {
        statusCode: HttpStatus.CONFLICT,
        code: 'RELATED_RECORD_CONFLICT',
        message: 'The request references a record that cannot be linked.',
      };
    case 'P2025':
      return {
        statusCode: HttpStatus.NOT_FOUND,
        code: 'RECORD_NOT_FOUND',
        message: 'The requested record was not found.',
      };
    default:
      return undefined;
  }
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
    const prismaError = mapPrismaError(exception);
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : (prismaError?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = isErrorPayload(exceptionResponse) ? exceptionResponse : undefined;
    const requestId = resolveRequestId(request, response);

    const normalized: NormalizedError = {
      statusCode,
      code:
        typeof payload?.code === 'string'
          ? payload.code
          : (prismaError?.code ?? defaultCode(statusCode)),
      message:
        statusCode === 500
          ? 'Internal server error.'
          : typeof payload?.message === 'string'
            ? payload.message
            : (prismaError?.message ??
              (exception instanceof Error ? exception.message : 'Request failed.')),
      requestId,
    };

    const details = payload?.details ?? prismaError?.details;
    if (details !== undefined) {
      normalized.details = details;
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
