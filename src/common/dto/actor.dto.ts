import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

/**
 * Body for an action that changes nothing but who performed it. Content uses its own
 * `ActorActionDto` because `ContentItem` also stores `createdBy`/`updatedBy`; the Slack-side
 * models record the actor only on the audit event.
 */
export class ActorDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  actorId!: string;
}
