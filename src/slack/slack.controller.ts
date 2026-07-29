import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequestId } from '../common/decorators/request-id.decorator';
import { SendTestMessageDto, SlackTestMessageResponseDto } from './dto/slack-test-message.dto';
import { SlackDiagnosticsService, type SlackTestMessageResult } from './slack-diagnostics.service';

@ApiTags('Slack')
@ApiSecurity('admin-key')
@Controller('slack')
export class SlackController {
  constructor(private readonly diagnostics: SlackDiagnosticsService) {}

  @Post('test-message')
  @ApiOperation({ summary: 'Post a fixed connectivity check to a Slack channel' })
  @ApiCreatedResponse({ type: SlackTestMessageResponseDto })
  sendTestMessage(
    @Body() dto: SendTestMessageDto,
    @RequestId() requestId: string,
  ): Promise<SlackTestMessageResult> {
    return this.diagnostics.sendTestMessage(dto, requestId);
  }
}
