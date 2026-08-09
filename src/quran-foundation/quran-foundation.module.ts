import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { QuranFoundationClient } from './quran-foundation.client';
import { QuranFoundationTokenService } from './quran-foundation-token.service';
import { QuranImportController } from './quran-import.controller';
import { QuranImportService } from './quran-import.service';

@Module({
  imports: [ContentModule],
  controllers: [QuranImportController],
  providers: [QuranFoundationTokenService, QuranFoundationClient, QuranImportService],
  exports: [QuranImportService, QuranFoundationClient],
})
export class QuranFoundationModule {}
