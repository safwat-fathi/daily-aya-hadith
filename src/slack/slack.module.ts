import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TokenCipherModule } from '../common/crypto/token-cipher.module';
import { SlackBlockRenderer } from './slack-block.renderer';
import { SlackClientFactory } from './slack-client.factory';
import { SlackDiagnosticsService } from './slack-diagnostics.service';
import { SlackController } from './slack.controller';
import { SLACK_GATEWAY } from './slack.gateway';
import { SlackService } from './slack.service';

@Module({
  imports: [AuditModule, TokenCipherModule],
  controllers: [SlackController],
  providers: [
    SlackBlockRenderer,
    SlackClientFactory,
    SlackService,
    SlackDiagnosticsService,
    { provide: SLACK_GATEWAY, useExisting: SlackService },
  ],
  exports: [SlackBlockRenderer, SlackClientFactory, SLACK_GATEWAY],
})
export class SlackModule {}
