import { ApiProperty } from '@nestjs/swagger';

class ImportedVerseDto {
  @ApiProperty()
  contentId!: string;

  @ApiProperty()
  surahNumber!: number;

  @ApiProperty()
  ayahNumber!: number;
}

class SkippedVerseDto {
  @ApiProperty()
  surahNumber!: number;

  @ApiProperty()
  ayahNumber!: number;
}

class FailedVerseDto {
  @ApiProperty()
  surahNumber!: number;

  @ApiProperty()
  ayahNumber!: number;

  @ApiProperty()
  message!: string;
}

export class QuranImportResponseDto {
  @ApiProperty({ type: () => [ImportedVerseDto] })
  created!: ImportedVerseDto[];

  @ApiProperty({
    type: () => [SkippedVerseDto],
    description:
      'Verses skipped because a non-archived AYAH draft/approved item already exists for them.',
  })
  skippedDuplicates!: SkippedVerseDto[];

  @ApiProperty({ type: () => [FailedVerseDto] })
  errors!: FailedVerseDto[];
}
