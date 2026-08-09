import { createHash, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AppEnvironment } from '../../config/env.validation';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Exported so the admin dashboard's login form can check the same key the same way. */
export function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

@Injectable()
export class AdminKeyGuard implements CanActivate {
  private readonly expectedKeyDigest: Buffer;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.expectedKeyDigest = digest(config.get('ADMIN_API_KEY', { infer: true }));
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const suppliedKey = request.headers['x-admin-key'];

    if (
      typeof suppliedKey !== 'string' ||
      !timingSafeEqual(this.expectedKeyDigest, digest(suppliedKey))
    ) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'UNAUTHORIZED_ADMIN',
        message: 'A valid X-Admin-Key header is required.',
      });
    }

    return true;
  }
}
