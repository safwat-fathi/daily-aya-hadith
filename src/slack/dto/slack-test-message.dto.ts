import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class SendTestMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  workspaceId!: string;

  @ApiProperty({
    description: 'Public (C…), private (G…), direct message (D…), or user (U…) channel.',
  })
  @IsString()
  @Matches(/^[CGDU][A-Z0-9]{2,}$/, {
    message: 'channelId must be a valid Slack channel or user ID',
  })
  channelId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class SlackTestMessageResponseDto {
  @ApiProperty()
  workspaceId!: string;

  @ApiProperty()
  channelId!: string;

  @ApiProperty({ description: 'Slack message timestamp, usable to delete the test message.' })
  messageTs!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  postedAt!: Date;
}
