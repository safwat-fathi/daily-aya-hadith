import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContentType, SourceType } from '../generated/prisma/enums';
import { type Prisma } from '../generated/prisma/client';
import {
  flattenValidationErrors,
  type ValidationErrorDetail,
} from '../common/utils/validation-errors';
import { toInputJsonObject } from '../common/utils/prisma-json';
import { contentValidationFailed } from './content.errors';
import {
  AyahPayloadDto,
  BlessingReminderPayloadDto,
  CompanionStoryPayloadDto,
  type ContentPayloadDto,
  HadithPayloadDto,
} from './dto/payloads.dto';

type PayloadConstructor = new () => ContentPayloadDto;

const PAYLOAD_DTO_BY_TYPE = {
  [ContentType.AYAH]: AyahPayloadDto,
  [ContentType.HADITH]: HadithPayloadDto,
  [ContentType.COMPANION_STORY]: CompanionStoryPayloadDto,
  [ContentType.BLESSING_REMINDER]: BlessingReminderPayloadDto,
} satisfies Record<ContentType, PayloadConstructor>;

// Verified against Quran Foundation's chapter metadata (api.quran.com), July 2026.
const SURAH_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
] as const;

export interface ApprovalSource {
  sourceType: SourceType;
  title: string;
}

export interface ApprovalContent {
  type: ContentType;
  payload: unknown;
  sources: ApprovalSource[];
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requiredField(
  details: ValidationErrorDetail[],
  field: string,
  value: string | undefined,
): void {
  if (!hasText(value)) {
    details.push({
      field: `payload.${field}`,
      message: `${field} is required for approval`,
    });
  }
}

function requireSourceType(
  details: ValidationErrorDetail[],
  sources: ApprovalSource[],
  sourceType: SourceType,
  field = 'sources',
): void {
  if (!sources.some((source) => source.sourceType === sourceType)) {
    details.push({
      field,
      message: `At least one ${sourceType} source is required for approval`,
    });
  }
}

@Injectable()
export class ContentValidationService {
  async validateDraft(type: ContentType, payload: unknown): Promise<Prisma.InputJsonObject> {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw contentValidationFailed([
        {
          field: 'payload',
          message: 'payload must be an object',
        },
      ]);
    }

    const PayloadDto = PAYLOAD_DTO_BY_TYPE[type];
    const instance = plainToInstance(PayloadDto, payload);
    const errors = await validate(instance, {
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      whitelist: true,
    });

    if (errors.length > 0) {
      throw contentValidationFailed(flattenValidationErrors(errors, 'payload'));
    }

    return toInputJsonObject(instance);
  }

  async validateForApproval(content: ApprovalContent): Promise<Prisma.InputJsonObject> {
    const normalizedPayload = await this.validateDraft(content.type, content.payload);
    const PayloadDto = PAYLOAD_DTO_BY_TYPE[content.type];
    const payload = plainToInstance(PayloadDto, normalizedPayload);
    const details: ValidationErrorDetail[] = [];

    if (content.sources.length === 0) {
      details.push({
        field: 'sources',
        message: 'At least one source is required for approval',
      });
    }

    for (const [index, source] of content.sources.entries()) {
      if (!hasText(source.title)) {
        details.push({
          field: `sources.${index}.title`,
          message: 'Source title cannot be blank',
        });
      }
    }

    switch (content.type) {
      case ContentType.AYAH:
        this.validateAyahApproval(payload, content.sources, details);
        break;
      case ContentType.HADITH:
        this.validateHadithApproval(payload, content.sources, details);
        break;
      case ContentType.COMPANION_STORY:
        this.validateCompanionStoryApproval(payload, details);
        break;
      case ContentType.BLESSING_REMINDER:
        this.validateBlessingApproval(payload, content.sources, details);
        break;
    }

    if (details.length > 0) {
      throw contentValidationFailed(details);
    }

    return normalizedPayload;
  }

  private validateAyahApproval(
    payload: ContentPayloadDto,
    sources: ApprovalSource[],
    details: ValidationErrorDetail[],
  ): void {
    if (!(payload instanceof AyahPayloadDto)) {
      return;
    }

    requiredField(details, 'arabicText', payload.arabicText);
    requiredField(details, 'surahNameArabic', payload.surahNameArabic);

    if (payload.surahNumber === undefined) {
      details.push({
        field: 'payload.surahNumber',
        message: 'surahNumber is required for approval',
      });
    }

    if (payload.ayahNumber === undefined) {
      details.push({
        field: 'payload.ayahNumber',
        message: 'ayahNumber is required for approval',
      });
    }

    if (payload.surahNumber !== undefined && payload.ayahNumber !== undefined) {
      const verseCount = SURAH_AYAH_COUNTS[payload.surahNumber - 1];
      if (verseCount !== undefined && payload.ayahNumber > verseCount) {
        details.push({
          field: 'payload.ayahNumber',
          message: `ayahNumber exceeds the ${verseCount} ayat in surah ${payload.surahNumber}`,
        });
      }
    }

    requireSourceType(details, sources, SourceType.QURAN);
  }

  private validateHadithApproval(
    payload: ContentPayloadDto,
    sources: ApprovalSource[],
    details: ValidationErrorDetail[],
  ): void {
    if (!(payload instanceof HadithPayloadDto)) {
      return;
    }

    requiredField(details, 'arabicText', payload.arabicText);
    requiredField(details, 'collection', payload.collection);
    requireSourceType(details, sources, SourceType.HADITH_COLLECTION);
  }

  private validateCompanionStoryApproval(
    payload: ContentPayloadDto,
    details: ValidationErrorDetail[],
  ): void {
    if (!(payload instanceof CompanionStoryPayloadDto)) {
      return;
    }

    requiredField(details, 'title', payload.title);
    requiredField(details, 'companionName', payload.companionName);
    requiredField(details, 'story', payload.story);

    if (!payload.lessons?.some(hasText)) {
      details.push({
        field: 'payload.lessons',
        message: 'At least one non-blank lesson is required for approval',
      });
    }
  }

  private validateBlessingApproval(
    payload: ContentPayloadDto,
    sources: ApprovalSource[],
    details: ValidationErrorDetail[],
  ): void {
    if (!(payload instanceof BlessingReminderPayloadDto)) {
      return;
    }

    requiredField(details, 'title', payload.title);
    requiredField(details, 'body', payload.body);

    if (hasText(payload.relatedAyahReference)) {
      requireSourceType(details, sources, SourceType.QURAN, 'payload.relatedAyahReference');
    }

    if (hasText(payload.relatedHadithReference)) {
      requireSourceType(
        details,
        sources,
        SourceType.HADITH_COLLECTION,
        'payload.relatedHadithReference',
      );
    }
  }
}
