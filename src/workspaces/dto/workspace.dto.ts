import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * PLAN.md §5.10 keeps raw Slack tokens out of the database: the row stores an *alias* that the
 * Slack client factory resolves against `SLACK_TOKEN_SECRET_KEY`. Rejecting `xox…` here is what
 * stops an administrator pasting the bot token itself into the column.
 */
const TOKEN_ALIAS_RULE = {
  message: 'tokenSecretKey must be a token alias, not a Slack token.',
};

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'T0123456789' })
  @IsString()
  @MaxLength(32)
  @Matches(/^[TE][A-Z0-9]{2,}$/, { message: 'slackTeamId must be a Slack team ID' })
  slackTeamId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Alias for the configured bot token, never the token itself.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^(?!xox)/i, TOKEN_ALIAS_RULE)
  tokenSecretKey!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: 'Alias for the configured bot token, never the token itself.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^(?!xox)/i, TOKEN_ALIAS_RULE)
  tokenSecretKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}

export class ListWorkspacesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class WorkspaceIdParamDto {
  @IsString()
  @MaxLength(64)
  id!: string;
}

export class WorkspaceResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  slackTeamId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  botUserId!: string | null;

  @ApiProperty({ description: 'Token alias, not a credential.' })
  tokenSecretKey!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  tokenLastVerifiedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class VerifyTokenResponseDto {
  @ApiProperty({ type: () => WorkspaceResponseDto })
  workspace!: WorkspaceResponseDto;

  @ApiProperty()
  teamId!: string;

  @ApiPropertyOptional()
  teamName?: string;

  @ApiPropertyOptional()
  botUserId?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  verifiedAt!: Date;
}
