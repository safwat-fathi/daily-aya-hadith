import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ImportedHadithDto {
  @ApiProperty()
  contentId!: string;

  @ApiProperty()
  bookSlug!: string;

  @ApiProperty()
  hadithNumber!: string;
}

class SkippedHadithDto {
  @ApiProperty()
  bookSlug!: string;

  @ApiProperty()
  hadithNumber!: string;
}

class FailedHadithDto {
  @ApiProperty()
  bookSlug!: string;

  @ApiPropertyOptional({
    description: 'Absent for a page-fetch-level failure with no single item to attach it to.',
  })
  hadithNumber?: string;

  @ApiProperty()
  message!: string;
}

export class HadithImportResponseDto {
  @ApiProperty({ type: () => [ImportedHadithDto] })
  created!: ImportedHadithDto[];

  @ApiProperty({
    type: () => [SkippedHadithDto],
    description:
      'Hadiths skipped because a non-archived HADITH draft/approved item already exists for them.',
  })
  skippedDuplicates!: SkippedHadithDto[];

  @ApiProperty({
    type: () => [SkippedHadithDto],
    description: 'Hadiths skipped because hadithapi.com returned no English text for them.',
  })
  skippedNoEnglish!: SkippedHadithDto[];

  @ApiProperty({ type: () => [FailedHadithDto] })
  errors!: FailedHadithDto[];
}
