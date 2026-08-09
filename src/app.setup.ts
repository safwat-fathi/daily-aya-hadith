import {
  BadRequestException,
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { flattenValidationErrors } from './common/utils/validation-errors';

export function configureApplication(app: INestApplication): void {
  app.useLogger(app.get(Logger));
  // The admin dashboard's HTML forms post `application/x-www-form-urlencoded` bodies using
  // bracket notation (`payload[arabicText]`, `sources[0][title]`) to build nested objects/arrays
  // that match the existing DTOs. This depends on `qs`'s `extended: true` parsing, which is
  // Nest's own default for the urlencoded body parser it registers automatically
  // (`ExpressAdapter.registerParserMiddleware` passes `{ extended: true }`) — verified against
  // the installed `@nestjs/platform-express` rather than assumed, so no override is added here.
  app.setGlobalPrefix('api/v1', {
    exclude: [
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
