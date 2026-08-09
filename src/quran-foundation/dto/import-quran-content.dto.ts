import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MAX_BATCH_SIZE = 20;

export class ImportQuranContentDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_BATCH_SIZE, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_BATCH_SIZE)
  count?: number;

  @ApiProperty({ description: 'Identifies who triggered the import, for the audit trail.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  actorId!: string;

  @ApiPropertyOptional({
    description:
      'Quran.Foundation translation resource id. Omit to use QURAN_FOUNDATION_TRANSLATION_RESOURCE_ID; pass an empty string for no translation.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  translationResourceId?: string;

  @ApiPropertyOptional({
    description:
      'Quran.Foundation tafsir resource id. Omit to use QURAN_FOUNDATION_TAFSIR_RESOURCE_ID; pass an empty string for no tafsir.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  tafsirResourceId?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether to fetch word-by-word meanings. The API has no language control for these (always English) — verified live.',
  })
  @IsOptional()
  @IsBoolean()
  includeWordMeanings?: boolean;
}
