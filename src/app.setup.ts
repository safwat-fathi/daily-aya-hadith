import { BadRequestException, RequestMethod, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { flattenValidationErrors } from './common/utils/validation-errors';

export function configureApplication(app: NestExpressApplication): void {
  app.useLogger(app.get(Logger));
  // Required for express-session's cookie.secure (admin-ui.setup.ts) to work behind a reverse
  // proxy — without any trust proxy setting, Express ignores X-Forwarded-Proto and treats every
  // request as insecure, so the Set-Cookie header is silently dropped. Any value >= 1 fixes that;
  // 2 (Cloudflare -> Nginx -> Node) is chosen for accurate req.ip resolution too.
  app.set('trust proxy', 2);
  // The admin dashboard's HTML forms post `application/x-www-form-urlencoded` bodies using
  // bracket notation (`payload[arabicText]`, `sources[0][title]`) to build nested objects/arrays
  // that match the existing DTOs. This depends on `qs`'s `extended: true` parsing, which is
  // Nest's own default for the urlencoded body parser it registers automatically
  // (`ExpressAdapter.registerParserMiddleware` passes `{ extended: true }`) — verified against
  // the installed `@nestjs/platform-express` rather than assumed, so no override is added here.
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: '', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          statusCode: 400,
          code: 'REQUEST_VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: flattenValidationErrors(errors),
        }),
    }),
  );
  app.enableShutdownHooks();
}
