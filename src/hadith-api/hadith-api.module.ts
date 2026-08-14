import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { HadithApiClient } from './hadith-api.client';
import { HadithImportController } from './hadith-import.controller';
import { HadithImportService } from './hadith-import.service';

@Module({
  imports: [ContentModule],
  controllers: [HadithImportController],
  providers: [HadithApiClient, HadithImportService],
  exports: [HadithImportService, HadithApiClient],
})
export class HadithApiModule {}
