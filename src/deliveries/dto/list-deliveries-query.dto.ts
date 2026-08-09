import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { DeliveryStatus } from '../../generated/prisma/enums';

export class ListDeliveriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DeliveryStatus, enumName: 'DeliveryStatus' })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  streamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  runId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  subscriberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  contentId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateTo?: string;
}

export class DeliveryIdParamDto {
  @IsString()
  @MaxLength(64)
  id!: string;
}

export class RunIdParamDto {
  @IsString()
  @MaxLength(64)
  id!: string;
}
