import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Slack sends either `code`+`state` on approval, or `error` (e.g. `access_denied`) if the
 * workspace admin declined the install. Both are optional here so validation can distinguish
 * "which case is this" from "is this well-formed" — `SlackOauthController` decides what a missing
 * `code` means only after checking `error` first.
 */
export class OauthCallbackQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  error?: string;

  // Slack (and OAuth 2.0 generally) may attach these alongside `error`. The global
  // ValidationPipe runs with forbidNonWhitelisted: true, so without declaring them here Slack's
  // own denial redirect gets rejected as REQUEST_VALIDATION_FAILED before the handler ever sees
  // it — the actual SLACK_OAUTH_DENIED path never runs. Unused otherwise.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error_description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  error_uri?: string;
}
