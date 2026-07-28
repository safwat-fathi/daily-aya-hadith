import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const RequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<Request>();

    if (typeof request.id === 'string' || typeof request.id === 'number') {
      return String(request.id);
    }

    return 'unknown';
  },
);
