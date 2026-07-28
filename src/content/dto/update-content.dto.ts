import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { ContentType } from '../../generated/prisma/enums';
import {
  AyahPayloadDto,
  BlessingReminderPayloadDto,
  CompanionStoryPayloadDto,
  HadithPayloadDto,
} from './payloads.dto';
import { SourceReferenceDto } from './source-reference.dto';

@ApiExtraModels(
  AyahPayloadDto,
  HadithPayloadDto,
  CompanionStoryPayloadDto,
  BlessingReminderPayloadDto,
)
export class UpdateContentDto {
  @ApiPropertyOptional({ enum: ContentType, enumName: 'ContentType' })
  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  locale?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string | null;

  @ApiPropertyOptional({
    description: 'Full replacement payload; omitted fields are not merged.',
    oneOf: [
      { $ref: getSchemaPath(AyahPayloadDto) },
      { $ref: getSchemaPath(HadithPayloadDto) },
      { $ref: getSchemaPath(CompanionStoryPayloadDto) },
      { $ref: getSchemaPath(BlessingReminderPayloadDto) },
    ],
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Full replacement source list when provided.',
    type: () => [SourceReferenceDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SourceReferenceDto)
  sources?: SourceReferenceDto[];

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  updatedBy!: string;
}
