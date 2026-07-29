import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SlackModule } from '../slack/slack.module';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

@Module({
  imports: [AuditModule, SlackModule],
  controllers: [SubscribersController],
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
