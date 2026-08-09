import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** PLAN.md §9.6: the administrative escape hatch requires a reason. */
export class MarkSkippedDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
