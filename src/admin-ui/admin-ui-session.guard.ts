import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

export const ADMIN_LOGIN_PATH = '/api/v1/admin/login';

/**
 * Browser-facing counterpart to `AdminKeyGuard`: checks a session flag instead of the
 * `X-Admin-Key` header, since HTML navigation and form posts can't carry a custom header. Every
 * admin-ui controller is marked `@Public()` (bypassing the global header-based guard) and
 * protected by this one instead — the JSON API's guard and security model are untouched.
 */
@Injectable()
export class AdminUiSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.session.admin === true) {
      return true;
    }

    const response = context.switchToHttp().getResponse<Response>();
    response.redirect(ADMIN_LOGIN_PATH);
    return false;
  }
}
