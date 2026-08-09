import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureAdminUiViews } from './admin-ui/admin-ui.setup';
import { AppModule } from './app.module';
import { configureApplication } from './app.setup';
import type { AppEnvironment } from './config/env.validation';
import { configureSwagger } from './swagger/setup-swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  configureApplication(app);
  configureSwagger(app);
  configureAdminUiViews(app);

  const config = app.get(ConfigService<AppEnvironment, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
