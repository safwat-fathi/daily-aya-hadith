import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { SourceType } from '../../generated/prisma/enums';

const BIBLIOGRAPHY_FIELD_MAX_LENGTH = 1000;

export class SourceReferenceDto {
  @ApiProperty({ enum: SourceType, enumName: 'SourceType' })
  @IsEnum(SourceType)
  sourceType!: SourceType;

  @ApiProperty()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  author?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  publisher?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  edition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  volume?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  page?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  chapter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  // Only meaningful when sourceType = QURAN — used to synthesize `title` instead of the
  // bibliography fields above, which don't apply to a Quran citation.
  @ApiPropertyOptional({ minimum: 1, maximum: 114 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(114)
  surahNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  surahNameArabic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(BIBLIOGRAPHY_FIELD_MAX_LENGTH)
  surahNameEnglish?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 286 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(286)
  ayahNumber?: number;
}
