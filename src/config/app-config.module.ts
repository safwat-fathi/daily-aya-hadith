import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerConfig } from './logger.config';
import { type AppEnvironment, validateEnvironment } from './env.validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnvironment, true>) =>
        createLoggerConfig({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          PORT: config.get('PORT', { infer: true }),
          APP_BASE_URL: config.get('APP_BASE_URL', { infer: true }),
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          ADMIN_API_KEY: config.get('ADMIN_API_KEY', { infer: true }),
          DEFAULT_TIMEZONE: config.get('DEFAULT_TIMEZONE', { infer: true }),
          DEFAULT_LOCALE: config.get('DEFAULT_LOCALE', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
          SLACK_BOT_TOKEN: config.get('SLACK_BOT_TOKEN', { infer: true }),
          SLACK_TOKEN_SECRET_KEY: config.get('SLACK_TOKEN_SECRET_KEY', { infer: true }),
          SCHEDULER_ENABLED: config.get('SCHEDULER_ENABLED', { infer: true }),
          SCHEDULER_INTERVAL_MINUTES: config.get('SCHEDULER_INTERVAL_MINUTES', {
            infer: true,
          }),
          SCHEDULER_LOCK_ID: config.get('SCHEDULER_LOCK_ID', { infer: true }),
          SWAGGER_ENABLED: config.get('SWAGGER_ENABLED', { infer: true }),
        }),
    }),
  ],
  exports: [ConfigModule, LoggerModule],
})
export class AppConfigModule {}
