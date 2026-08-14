import { ApiProperty } from '@nestjs/swagger';
import { ContentStatus, ContentType } from '../../generated/prisma/enums';

export class ValidationErrorDetailDto {
  @ApiProperty()
  field!: string;

  @ApiProperty()
  message!: string;
}

export class ContentPreviewResponseDto {
  @ApiProperty()
  contentId!: string;

  @ApiProperty({ enum: ContentType, enumName: 'ContentType' })
  type!: ContentType;

  @ApiProperty({ enum: ContentStatus, enumName: 'ContentStatus' })
  status!: ContentStatus;

  @ApiProperty({ example: 'ayah-v2' })
  rendererVersion!: string;

  @ApiProperty({ description: 'Plain-text notification fallback.' })
  text!: string;

  @ApiProperty({
    description: 'Slack Block Kit blocks.',
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  blocks!: object[];

  @ApiProperty({
    description: 'How the message will render, prefixed `limit.` or `render.`.',
    type: [String],
  })
  warnings!: string[];

  @ApiProperty({
    description: 'What would block approval. Empty when the item is approvable.',
    type: () => [ValidationErrorDetailDto],
  })
  approvalIssues!: ValidationErrorDetailDto[];
}
