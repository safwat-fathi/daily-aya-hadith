import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlackModule } from '../slack/slack.module';
import { SlackEventsService } from './slack-events.service';

@Module({
  imports: [PrismaModule, SubscribersModule, SlackModule, AuditModule],
  providers: [SlackEventsService],
})
export class SlackEventsModule {}
