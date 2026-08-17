import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequestId } from '../common/decorators/request-id.decorator';
import { ImportQuranContentDto } from './dto/import-quran-content.dto';
import { QuranImportResponseDto } from './dto/quran-import-response.dto';
import { QuranImportService, type QuranImportResult } from './quran-import.service';

const DEFAULT_BATCH_SIZE = 1;

@ApiTags('QuranFoundation')
@ApiSecurity('admin-key')
@Controller('quran-foundation')
export class QuranImportController {
  constructor(private readonly importService: QuranImportService) {}

  @Post('import')
  @ApiOperation({
    summary:
      'Import the next N verses from Quran.Foundation, in sequential Mushaf order, as AYAH content stored already approved',
  })
  @ApiCreatedResponse({ type: QuranImportResponseDto })
  import(
    @Body() dto: ImportQuranContentDto,
    @RequestId() requestId: string,
  ): Promise<QuranImportResult> {
    return this.importService.importNext(dto.count ?? DEFAULT_BATCH_SIZE, dto.actorId, requestId, {
      translationResourceId: dto.translationResourceId,
      tafsirResourceId: dto.tafsirResourceId,
      includeWordMeanings: dto.includeWordMeanings ?? true,
    });
  }
}
