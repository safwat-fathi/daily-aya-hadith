import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { SEND_TIME_PATTERN } from '../../common/utils/schedule-time';
import { IsIanaTimeZone } from '../../common/validators/is-iana-timezone.validator';
import { ContentType, ScheduleFrequency, SelectionStrategy } from '../../generated/prisma/client';

export class CreateStreamDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  workspaceId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiProperty({ enum: ScheduleFrequency })
  @IsEnum(ScheduleFrequency)
  frequency!: ScheduleFrequency;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(SEND_TIME_PATTERN, { message: 'sendTime must be in HH:mm format' })
  sendTime!: string;

  @ApiProperty()
  @IsIanaTimeZone()
  timezone!: string;

  @ApiPropertyOptional({ type: [Number], description: 'Days of week, 0=Sunday to 6=Saturday' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ default: 'ar' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  locale?: string;

  @ApiProperty({ enum: ContentType, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ContentType, { each: true })
  allowedContentTypes!: ContentType[];

  @ApiPropertyOptional({ enum: SelectionStrategy, default: SelectionStrategy.LEAST_RECENTLY_SENT })
  @IsOptional()
  @IsEnum(SelectionStrategy)
  selectionStrategy?: SelectionStrategy;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAutomaticAttempts?: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class UpdateStreamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: ScheduleFrequency })
  @IsOptional()
  @IsEnum(ScheduleFrequency)
  frequency?: ScheduleFrequency;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  @Matches(SEND_TIME_PATTERN, { message: 'sendTime must be in HH:mm format' })
  sendTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIanaTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ type: [Number], description: 'Days of week, 0=Sunday to 6=Saturday' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  locale?: string;

  @ApiPropertyOptional({ enum: ContentType, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ContentType, { each: true })
  allowedContentTypes?: ContentType[];

  @ApiPropertyOptional({ enum: SelectionStrategy })
  @IsOptional()
  @IsEnum(SelectionStrategy)
  selectionStrategy?: SelectionStrategy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAutomaticAttempts?: number;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class StreamEnableDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class ListStreamsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class StreamIdParamDto {
  @IsString()
  @MaxLength(64)
  id!: string;
}

export class StreamResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty({ enum: ScheduleFrequency })
  frequency!: ScheduleFrequency;

  @ApiProperty()
  sendTime!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ type: [Number] })
  daysOfWeek!: number[];

  @ApiProperty()
  locale!: string;

  @ApiProperty({ enum: ContentType, isArray: true })
  allowedContentTypes!: ContentType[];

  @ApiProperty({ enum: SelectionStrategy })
  selectionStrategy!: SelectionStrategy;

  @ApiProperty()
  maxAutomaticAttempts!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
