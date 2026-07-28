import { IsString, MaxLength, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActorActionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  actorId!: string;
}

export class ReviewDecisionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reviewerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  reviewNote?: string;
}

export class RejectContentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reviewerId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  reviewNote!: string;
}
