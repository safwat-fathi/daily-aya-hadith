import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SlackModule } from '../slack/slack.module';
import { ContentChecksumService } from './content-checksum.service';
import { ContentPreviewService } from './content-preview.service';
import { ContentValidationService } from './content-validation.service';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [AuditModule, SlackModule],
  controllers: [ContentController],
  providers: [
    ContentService,
    ContentValidationService,
    ContentChecksumService,
    ContentPreviewService,
  ],
  exports: [ContentService, ContentValidationService, ContentChecksumService, ContentPreviewService],
})
export class ContentModule {}
