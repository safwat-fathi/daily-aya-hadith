import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
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
export class CreateContentDto {
  @ApiProperty({ enum: ContentType, enumName: 'ContentType' })
  @IsEnum(ContentType)
  type!: ContentType;

  @ApiPropertyOptional({ default: 'ar' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  locale = 'ar';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string | null;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(AyahPayloadDto) },
      { $ref: getSchemaPath(HadithPayloadDto) },
      { $ref: getSchemaPath(CompanionStoryPayloadDto) },
      { $ref: getSchemaPath(BlessingReminderPayloadDto) },
    ],
  })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiProperty({ type: () => [SourceReferenceDto], default: [] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SourceReferenceDto)
  sources: SourceReferenceDto[] = [];

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  createdBy!: string;
}
