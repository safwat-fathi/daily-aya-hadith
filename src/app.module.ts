import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AdminKeyGuard } from './common/guards/admin-key.guard';
import { AppConfigModule } from './config/app-config.module';
import { AuditModule } from './audit/audit.module';
import { ContentModule } from './content/content.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReviewModule } from './review/review.module';

@Module({
  imports: [AppConfigModule, PrismaModule, HealthModule, AuditModule, ContentModule, ReviewModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AdminKeyGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
