import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ContentChecksumService } from './content-checksum.service';
import { ContentValidationService } from './content-validation.service';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [AuditModule],
  controllers: [ContentController],
  providers: [ContentService, ContentValidationService, ContentChecksumService],
  exports: [ContentService, ContentValidationService, ContentChecksumService],
})
export class ContentModule {}
