import { timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { digest } from '../common/guards/admin-key.guard';
import type { AppEnvironment } from '../config/env.validation';

/**
 * Deliberately outside `AdminUiSessionGuard`'s protection — everything else in `admin-ui/` needs
 * that guard, but applying it here would redirect an unauthenticated visitor to `/login` from
 * `/login` itself. `@Public()` alone is enough: it only bypasses the header-based `AdminKeyGuard`,
 * which browser navigation can't satisfy anyway.
 */
@Public()
@Controller('admin')
export class LoginController {
  constructor(private readonly config: ConfigService<AppEnvironment, true>) {}

  @Get('login')
  showLogin(@Req() request: Request, @Res() response: Response): void {
    if (request.session.admin === true) {
      response.redirect('/api/v1/admin/content');
      return;
    }

    response.render('login', { title: 'Log in', error: null });
  }

  @Post('login')
  login(
    @Body('adminKey') adminKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): void {
    const expected = digest(this.config.get('ADMIN_API_KEY', { infer: true }));
    const supplied = digest(adminKey ?? '');

    if (adminKey === undefined || !timingSafeEqual(expected, supplied)) {
      // Nest pre-sets 201 as the default status for @Post() handlers before the handler body
      // runs; render() doesn't override an already-set status code, so without this an error
      // page would come back as HTTP 201.
      response.status(200).render('login', { title: 'Log in', error: 'Invalid admin key.' });
      return;
    }

    request.session.admin = true;
    response.redirect('/api/v1/admin/content');
  }

  @Post('logout')
  logout(@Req() request: Request, @Res() response: Response): void {
    request.session.destroy(() => {
      response.redirect('/api/v1/admin/login');
    });
  }
}
