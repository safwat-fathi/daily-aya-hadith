import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ContentStatus,
  ContentType,
  DeliveryStatus,
  DeliveryTriggerType,
} from '../../generated/prisma/enums';
import { DeliveryResponseDto } from './delivery-response.dto';

class RunContentSummaryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ContentType })
  type!: ContentType;

  @ApiPropertyOptional()
  title!: string | null;

  @ApiProperty({ enum: ContentStatus })
  status!: ContentStatus;
}

export class RunResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  streamId!: string;

  @ApiPropertyOptional()
  contentId!: string | null;

  @ApiProperty({ enum: DeliveryTriggerType })
  triggerType!: DeliveryTriggerType;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;

  @ApiProperty({ type: String, format: 'date' })
  deliveryLocalDate!: Date;

  @ApiPropertyOptional()
  idempotencyKey!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  scheduledFor!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  skippedAt!: Date | null;

  @ApiPropertyOptional()
  errorCode!: string | null;

  @ApiPropertyOptional()
  rendererVersion!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ type: RunContentSummaryDto })
  content!: RunContentSummaryDto | null;

  @ApiProperty({ type: DeliveryResponseDto, isArray: true })
  deliveries!: DeliveryResponseDto[];
}
