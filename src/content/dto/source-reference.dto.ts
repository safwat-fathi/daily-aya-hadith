import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
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
}
