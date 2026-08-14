import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { SubscribersModule } from '../subscribers/subscribers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SlackModule } from '../slack/slack.module';
import { SlackEventsService } from './slack-events.service';

@Module({
  imports: [PrismaModule, SubscribersModule, SlackModule, AuditModule, DeliveriesModule],
  providers: [SlackEventsService],
})
export class SlackEventsModule {}
