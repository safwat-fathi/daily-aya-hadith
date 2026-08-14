import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const MAX_BATCH_SIZE = 100;

export class ImportHadithContentDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_BATCH_SIZE, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_BATCH_SIZE)
  count?: number;

  @ApiProperty({ description: 'Identifies who triggered the import, for the audit trail.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  actorId!: string;
}
