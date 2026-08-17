import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequestId } from '../common/decorators/request-id.decorator';
import { ImportHadithContentDto } from './dto/import-hadith-content.dto';
import { HadithImportResponseDto } from './dto/hadith-import-response.dto';
import { HadithImportService, type HadithImportResult } from './hadith-import.service';

const DEFAULT_BATCH_SIZE = 1;

@ApiTags('HadithApi')
@ApiSecurity('admin-key')
@Controller('hadith-api')
export class HadithImportController {
  constructor(private readonly importService: HadithImportService) {}

  @Post('import')
  @ApiOperation({
    summary:
      'Import the next N Arabic+English hadiths from HadeethEnc (hadeethenc.com), walking its category tree, as HADITH content stored already approved (weak/disputed grades are skipped)',
  })
  @ApiCreatedResponse({ type: HadithImportResponseDto })
  import(
    @Body() dto: ImportHadithContentDto,
    @RequestId() requestId: string,
  ): Promise<HadithImportResult> {
    return this.importService.importNext(dto.count ?? DEFAULT_BATCH_SIZE, dto.actorId, requestId);
  }
}
