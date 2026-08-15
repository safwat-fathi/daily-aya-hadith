import { HttpException, HttpStatus } from '@nestjs/common';

export function oauthNotConfigured(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'SLACK_OAUTH_NOT_CONFIGURED',
      message:
        'Slack OAuth is not configured. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and SLACK_TOKEN_ENCRYPTION_KEY.',
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export function oauthStateInvalid(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'SLACK_OAUTH_STATE_INVALID',
      message: 'This install link has expired or is invalid. Start the install again.',
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function oauthDenied(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'SLACK_OAUTH_DENIED',
      message: 'The Slack workspace administrator did not approve the install.',
    },
    HttpStatus.BAD_REQUEST,
  );
}

export function oauthExchangeFailed(reason: string): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.BAD_GATEWAY,
      code: 'SLACK_OAUTH_EXCHANGE_FAILED',
      message: 'Slack rejected the OAuth code exchange.',
      details: { reason },
    },
    HttpStatus.BAD_GATEWAY,
  );
}

export function oauthEnterpriseInstallUnsupported(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'SLACK_OAUTH_ENTERPRISE_UNSUPPORTED',
      message:
        'Enterprise-wide installs are not supported yet. Install into a single workspace instead.',
    },
    HttpStatus.BAD_REQUEST,
  );
}
