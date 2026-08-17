import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AdminUiModule } from './admin-ui/admin-ui.module';
import { ClockModule } from './common/clock/clock.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AdminKeyGuard } from './common/guards/admin-key.guard';
import { AppConfigModule } from './config/app-config.module';
import { AuditModule } from './audit/audit.module';
import { ContentModule } from './content/content.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { HadithApiModule } from './hadith-api/hadith-api.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuranFoundationModule } from './quran-foundation/quran-foundation.module';
import { ReviewModule } from './review/review.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SlackModule } from './slack/slack.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { SlackEventsModule } from './slack-events/slack-events.module';
import { SlackOauthModule } from './slack-oauth/slack-oauth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { WorkspacePurgeModule } from './workspace-purge/workspace-purge.module';
import { StreamsModule } from './streams/streams.module';

@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    PrismaModule,
    HealthModule,
    AuditModule,
    ContentModule,
    QuranFoundationModule,
    HadithApiModule,
    ReviewModule,
    SlackModule,
    WorkspacesModule,
    SubscribersModule,
    SlackEventsModule,
    SlackOauthModule,
    StreamsModule,
    DeliveriesModule,
    SchedulerModule,
    WorkspacePurgeModule,
    AdminUiModule,
  ],
  controllers: [AppController],
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
