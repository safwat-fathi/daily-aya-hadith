import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { IsIanaTimeZone } from '../../common/validators/is-iana-timezone.validator';
import { SEND_TIME_PATTERN } from '../../common/utils/schedule-time';

const USER_ID_RULE = { message: 'slackUserId must be a valid Slack user ID or direct message ID' };
/** `C…` public, `G…` private, `D…` direct messages, `U…` user. */
const USER_ID_PATTERN = /^[CGDU][A-Z0-9]{2,}$/;

export class CreateSubscriberDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  workspaceId!: string;

  @ApiProperty({ example: 'U0123456789' })
  @IsString()
  @Matches(USER_ID_PATTERN, USER_ID_RULE)
  slackUserId!: string;

  @ApiPropertyOptional({ default: 'Africa/Cairo' })
  @IsOptional()
  @IsIanaTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ default: 'ar' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  locale?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class UpdateSubscriberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIanaTimeZone()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** `null` clears the override (falls back to the stream's `sendTime`); omit to leave unchanged. */
  @ApiPropertyOptional({ nullable: true, example: '07:30' })
  @IsOptional()
  @IsString()
  @Matches(SEND_TIME_PATTERN)
  sendTime?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class ListSubscribersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspaceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SubscriberIdParamDto {
  @IsString()
  @MaxLength(64)
  id!: string;
}

export class SubscriberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  slackUserId!: string;

  @ApiProperty()
  timezone!: string;

  @ApiProperty({ nullable: true })
  sendTime!: string | null;

  @ApiProperty()
  locale!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
