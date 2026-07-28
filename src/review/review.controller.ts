import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequestId } from '../common/decorators/request-id.decorator';
import { ContentDetailResponseDto } from '../content/dto/content-response.dto';
import { ContentIdParamDto } from '../content/dto/content-query.dto';
import {
  ActorActionDto,
  RejectContentDto,
  ReviewDecisionDto,
} from '../content/dto/review-action.dto';
import type { ContentDetail } from '../content/content.select';
import { ReviewService } from './review.service';

@ApiTags('Content review')
@ApiSecurity('admin-key')
@Controller('content')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post(':id/submit-review')
  @ApiOperation({ summary: 'Submit a draft for editorial review' })
  @ApiCreatedResponse({ type: ContentDetailResponseDto })
  submit(
    @Param() params: ContentIdParamDto,
    @Body() dto: ActorActionDto,
    @RequestId() requestId: string,
  ): Promise<ContentDetail> {
    return this.reviewService.submit(params.id, dto, requestId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Validate and approve content under review' })
  @ApiCreatedResponse({ type: ContentDetailResponseDto })
  approve(
    @Param() params: ContentIdParamDto,
    @Body() dto: ReviewDecisionDto,
    @RequestId() requestId: string,
  ): Promise<ContentDetail> {
    return this.reviewService.approve(params.id, dto, requestId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject content under review with a required note' })
  @ApiCreatedResponse({ type: ContentDetailResponseDto })
  reject(
    @Param() params: ContentIdParamDto,
    @Body() dto: RejectContentDto,
    @RequestId() requestId: string,
  ): Promise<ContentDetail> {
    return this.reviewService.reject(params.id, dto, requestId);
  }
}
