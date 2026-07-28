import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './app.setup';
import type { AppEnvironment } from './config/env.validation';
import { configureSwagger } from './swagger/setup-swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  configureApplication(app);
  configureSwagger(app);

  const config = app.get(ConfigService<AppEnvironment, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
