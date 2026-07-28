import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ContentStatus, ContentType } from '../../generated/prisma/enums';

export enum ContentSort {
  CREATED_AT_ASC = 'createdAt:asc',
  CREATED_AT_DESC = 'createdAt:desc',
  UPDATED_AT_ASC = 'updatedAt:asc',
  UPDATED_AT_DESC = 'updatedAt:desc',
  TITLE_ASC = 'title:asc',
  TITLE_DESC = 'title:desc',
}

export class ListContentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ContentType, enumName: 'ContentType' })
  @IsOptional()
  @IsEnum(ContentType)
  type?: ContentType;

  @ApiPropertyOptional({ enum: ContentStatus, enumName: 'ContentStatus' })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    enum: ContentSort,
    default: ContentSort.CREATED_AT_DESC,
  })
  @IsOptional()
  @IsEnum(ContentSort)
  sort: ContentSort = ContentSort.CREATED_AT_DESC;
}

export class ContentIdParamDto {
  @IsString()
  @MaxLength(64)
  id!: string;
}

export class DeliveryHistoryQueryDto extends PaginationQueryDto {}

export class AuditDateRangeDto {
  @IsOptional()
  @Type(() => String)
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @IsOptional()
  @Type(() => String)
  @IsISO8601({ strict: true })
  dateTo?: string;
}
