import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { ContentStatus, ContentType, SourceType } from '../../generated/prisma/enums';
import {
  AyahPayloadDto,
  BlessingReminderPayloadDto,
  CompanionStoryPayloadDto,
  HadithPayloadDto,
} from './payloads.dto';

export class ContentSourceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: SourceType, enumName: 'SourceType' })
  sourceType!: SourceType;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  author!: string | null;

  @ApiPropertyOptional({ nullable: true })
  publisher!: string | null;

  @ApiPropertyOptional({ nullable: true })
  edition!: string | null;

  @ApiPropertyOptional({ nullable: true })
  volume!: string | null;

  @ApiPropertyOptional({ nullable: true })
  page!: string | null;

  @ApiPropertyOptional({ nullable: true })
  chapter!: string | null;

  @ApiPropertyOptional({ nullable: true })
  referenceNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  url!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

export class ContentSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ContentType, enumName: 'ContentType' })
  type!: ContentType;

  @ApiProperty({ enum: ContentStatus, enumName: 'ContentStatus' })
  status!: ContentStatus;

  @ApiProperty()
  locale!: string;

  @ApiPropertyOptional({ nullable: true })
  title!: string | null;

  @ApiProperty()
  version!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ContentDetailResponseDto extends ContentSummaryResponseDto {
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(AyahPayloadDto) },
      { $ref: getSchemaPath(HadithPayloadDto) },
      { $ref: getSchemaPath(CompanionStoryPayloadDto) },
      { $ref: getSchemaPath(BlessingReminderPayloadDto) },
    ],
  })
  payload!: object;

  @ApiProperty({ type: () => [ContentSourceResponseDto] })
  sources!: ContentSourceResponseDto[];

  @ApiPropertyOptional({ nullable: true })
  parentContentId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewerId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reviewNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  contentChecksum!: string | null;

  @ApiProperty({ type: () => [ContentSummaryResponseDto] })
  revisions!: ContentSummaryResponseDto[];
}
