import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  ContentPreviewResponseDto,
  ValidationErrorDetailDto,
} from '../content/dto/content-preview-response.dto';
import {
  ContentDetailResponseDto,
  ContentSourceResponseDto,
  ContentSummaryResponseDto,
} from '../content/dto/content-response.dto';
import {
  AyahPayloadDto,
  BlessingReminderPayloadDto,
  CompanionStoryPayloadDto,
  HadithPayloadDto,
} from '../content/dto/payloads.dto';
import type { AppEnvironment } from '../config/env.validation';
import { SlackTestMessageResponseDto } from '../slack/dto/slack-test-message.dto';
import { SubscriberResponseDto } from '../subscribers/dto/subscriber.dto';
import { VerifyTokenResponseDto, WorkspaceResponseDto } from '../workspaces/dto/workspace.dto';

export function configureSwagger(app: INestApplication): void {
  const config = app.get(ConfigService<AppEnvironment, true>);
  if (
    config.get('NODE_ENV', { infer: true }) === 'production' ||
    !config.get('SWAGGER_ENABLED', { infer: true })
  ) {
    return;
  }

  const documentConfig = new DocumentBuilder()
    .setTitle('Slack Aya & Hadith API')
    .setDescription('Administrative API for reviewed Islamic content and delivery operations.')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Admin-Key',
        in: 'header',
        description: 'Administrative API key',
      },
      'admin-key',
    )
    .build();
  const document = SwaggerModule.createDocument(app, documentConfig, {
    extraModels: [
      AyahPayloadDto,
      HadithPayloadDto,
      CompanionStoryPayloadDto,
      BlessingReminderPayloadDto,
      ContentSourceResponseDto,
      ContentSummaryResponseDto,
      ContentDetailResponseDto,
      ValidationErrorDetailDto,
      ContentPreviewResponseDto,
      WorkspaceResponseDto,
      VerifyTokenResponseDto,
      SubscriberResponseDto,
      SlackTestMessageResponseDto,
    ],
  });

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Slack Aya & Hadith API',
  });
}
