import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const SHORT_TEXT_MAX_LENGTH = 500;
// Exported for src/quran-foundation/html-text.ts, which must clamp imported translation/tafsir
// text to this same bound before it reaches ContentService.create() — Quran.Foundation tafsir
// text can run tens of thousands of characters (confirmed live against Ibn Kathir), far past
// what fits here.
export const LONG_TEXT_MAX_LENGTH = 10_000;

export class WordMeaningDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  word?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  meaning?: string;
}

export class SababAlNuzulDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  appliesToWholeAyah?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  scholarlyNote?: string;
}

export class AyahPayloadDto {
  @ApiPropertyOptional({ description: 'Stored Quran text; never normalized or trimmed.' })
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  arabicText?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 114 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(114)
  surahNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  surahNameArabic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  surahNameEnglish?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 286 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(286)
  ayahNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  translation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  conciseTafsir?: string;

  @ApiPropertyOptional({ type: () => [WordMeaningDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WordMeaningDto)
  wordMeanings?: WordMeaningDto[];

  @ApiPropertyOptional({ type: () => SababAlNuzulDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SababAlNuzulDto)
  sababAlNuzul?: SababAlNuzulDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  reflection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  practicalAction?: string;
}

export class HadithPayloadDto {
  @ApiPropertyOptional({ description: 'Stored hadith text; never normalized or trimmed.' })
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  arabicText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  translation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  narrator?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  collection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  book?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  hadithNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  grade?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  grader?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  conciseExplanation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  reflection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  practicalAction?: string;
}

export class CompanionStoryPayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  companionName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  arabicName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  story?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  historicalContext?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(LONG_TEXT_MAX_LENGTH, { each: true })
  lessons?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  reflection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  practicalAction?: string;
}

export class BlessingReminderPayloadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  body?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 30 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(LONG_TEXT_MAX_LENGTH, { each: true })
  examples?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  relatedAyahReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(SHORT_TEXT_MAX_LENGTH)
  relatedHadithReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  reflection?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(LONG_TEXT_MAX_LENGTH)
  gratitudeAction?: string;
}

export type ContentPayloadDto =
  AyahPayloadDto | HadithPayloadDto | CompanionStoryPayloadDto | BlessingReminderPayloadDto;
