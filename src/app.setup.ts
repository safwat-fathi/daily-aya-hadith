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
