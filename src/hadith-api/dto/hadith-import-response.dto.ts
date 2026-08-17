import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ImportedHadithDto {
  @ApiProperty()
  contentId!: string;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  hadithId!: string;
}

class SkippedHadithDto {
  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  hadithId!: string;
}

class SkippedWeakGradeHadithDto {
  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  hadithId!: string;

  @ApiProperty({ description: 'The Arabic grade text that matched the weak/disputed denylist.' })
  grade!: string;
}

class FailedHadithDto {
  @ApiProperty()
  categoryId!: string;

  @ApiPropertyOptional({
    description: 'Absent for a page-fetch-level failure with no single item to attach it to.',
  })
  hadithId?: string;

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
    description: 'Hadiths skipped because HadeethEnc had no English text available for them.',
  })
  skippedNoEnglish!: SkippedHadithDto[];

  @ApiProperty({
    type: () => [SkippedWeakGradeHadithDto],
    description:
      "Hadiths skipped because HadeethEnc's own grade for them matched a weak/disputed denylist (PLAN.md §5.5).",
  })
  skippedWeakGrade!: SkippedWeakGradeHadithDto[];

  @ApiProperty({ type: () => [FailedHadithDto] })
  errors!: FailedHadithDto[];
}
