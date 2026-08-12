import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TokenCipherModule } from '../common/crypto/token-cipher.module';
import { SlackModule } from '../slack/slack.module';
import { StreamsModule } from '../streams/streams.module';
import { OauthStateService } from './oauth-state.service';
import { SlackOauthController } from './slack-oauth.controller';
import { SlackOauthService } from './slack-oauth.service';

@Module({
  imports: [AuditModule, TokenCipherModule, SlackModule, StreamsModule],
  controllers: [SlackOauthController],
  providers: [SlackOauthService, OauthStateService],
})
export class SlackOauthModule {}
