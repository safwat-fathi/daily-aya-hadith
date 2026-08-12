import { Controller, Get, HttpStatus, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { hasText } from '../common/utils/text';
import { OauthCallbackQueryDto } from './dto/oauth-callback-query.dto';
import { OauthStateService } from './oauth-state.service';
import { SlackOauthService } from './slack-oauth.service';
import { oauthDenied, oauthStateInvalid } from './slack-oauth.errors';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Public "Add to Slack" install flow — browser redirects, not JSON, so both handlers use `@Res()`
 * to control the response directly. Both are `@Public()`: the global `AdminKeyGuard` would
 * otherwise reject Slack's own redirect back to `/slack/oauth/callback`, which never carries an
 * `X-Admin-Key` header.
 */
@ApiTags('Slack OAuth')
@Public()
@Controller('slack')
export class SlackOauthController {
  constructor(
    private readonly slackOauthService: SlackOauthService,
    private readonly stateService: OauthStateService,
  ) {}

  @Get('install')
  @ApiOperation({ summary: 'Start the public "Add to Slack" OAuth install flow' })
  install(@Res() res: Response): void {
    const state = this.stateService.issue();
    res.redirect(this.slackOauthService.buildAuthorizeUrl(state));
  }

  @Get('oauth/callback')
  @ApiOperation({ summary: 'Slack OAuth redirect target; completes the install' })
  async callback(@Query() query: OauthCallbackQueryDto, @Res() res: Response): Promise<void> {
    if (hasText(query.error)) {
      throw oauthDenied();
    }

    if (!hasText(query.code) || !hasText(query.state) || !this.stateService.verify(query.state)) {
      throw oauthStateInvalid();
    }

    const { workspace, isReinstall, hasDefaultStream } =
      await this.slackOauthService.completeInstall(query.code);

    res
      .status(HttpStatus.OK)
      .type('html')
      .send(this.renderSuccessPage(workspace.name, isReinstall, hasDefaultStream));
  }

  private renderSuccessPage(
    workspaceName: string,
    isReinstall: boolean,
    hasDefaultStream: boolean,
  ): string {
    const heading = isReinstall ? 'Reinstalled' : 'Installed';
    const name = escapeHtml(workspaceName);
    // Only claim what actually happened: `completeInstall` still succeeds even if default-stream
    // provisioning failed, so this must not unconditionally promise a working Daily Aya stream.
    const streamNote = hasDefaultStream
      ? '<p>A default daily Ayah stream was set up automatically.</p>'
      : '<p><strong>Note:</strong> automatic stream setup failed. An admin needs to create one via the admin API before any content is sent.</p>';

    return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${heading} — Daily Aya &amp; Hadith</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; text-align: center;">
  <h1>${heading} into ${name}</h1>
  <p>Send <code>/subscribe</code> to the bot in Slack to start receiving Daily Aya.</p>
  ${streamNote}
</body>
</html>`;
  }
}
