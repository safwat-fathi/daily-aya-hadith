import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SlackBlockRenderer } from './slack-block.renderer';
import { SlackClientFactory } from './slack-client.factory';
import { SlackDiagnosticsService } from './slack-diagnostics.service';
import { SlackController } from './slack.controller';
import { SLACK_GATEWAY } from './slack.gateway';
import { SlackService } from './slack.service';

@Module({
  imports: [AuditModule],
  controllers: [SlackController],
  providers: [
    SlackBlockRenderer,
    SlackClientFactory,
    SlackService,
    SlackDiagnosticsService,
    { provide: SLACK_GATEWAY, useExisting: SlackService },
  ],
  exports: [SlackBlockRenderer, SLACK_GATEWAY],
})
export class SlackModule {}
