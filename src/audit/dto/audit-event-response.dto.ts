import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditEventResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  workspaceId!: string | null;

  @ApiProperty()
  actorId!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  entityType!: string;

  @ApiProperty()
  entityId!: string;

  @ApiPropertyOptional({ nullable: true })
  requestId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Object })
  metadata!: object | null;

  @ApiProperty({ format: 'date-time', type: String })
  createdAt!: Date;
}
