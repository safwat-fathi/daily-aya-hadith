import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus, DeliveryTriggerType } from '../../generated/prisma/enums';

class DeliveryRunSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  streamId!: string;

  @ApiPropertyOptional()
  contentId!: string | null;

  @ApiProperty({ type: String, format: 'date' })
  deliveryLocalDate!: Date;

  @ApiProperty({ enum: DeliveryTriggerType })
  triggerType!: DeliveryTriggerType;
}

export class DeliveryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  runId!: string;

  @ApiProperty()
  subscriberId!: string;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;

  @ApiPropertyOptional()
  slackChannelId!: string | null;

  @ApiPropertyOptional()
  slackMessageTs!: string | null;

  @ApiProperty()
  attemptCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  nextRetryAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  lastAttemptAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  sentAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  failedAt!: Date | null;

  @ApiPropertyOptional()
  errorCode!: string | null;

  @ApiPropertyOptional()
  errorMessage!: string | null;

  @ApiPropertyOptional()
  isRetryable!: boolean | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({ type: DeliveryRunSummaryDto })
  run!: DeliveryRunSummaryDto;
}
