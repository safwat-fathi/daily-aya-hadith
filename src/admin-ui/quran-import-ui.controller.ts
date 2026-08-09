import { Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequestId } from '../common/decorators/request-id.decorator';
import type { QuranFoundationResource } from '../quran-foundation/quran-foundation.client';
import { QuranFoundationClient } from '../quran-foundation/quran-foundation.client';
import {
  QuranImportService,
  type QuranImportResult,
} from '../quran-foundation/quran-import.service';
import { AdminUiSessionGuard } from './admin-ui-session.guard';
import { ADMIN_UI_ACTOR } from './constants';
import { str } from './content-form.helpers';
import { extractErrorMessage, readFlash, setFlash } from './flash';

const MIN_COUNT = 1;
const MAX_COUNT = 20;

function clampCount(raw: unknown): number {
  const parsed = Number(raw);
  const value = Number.isFinite(parsed) ? Math.trunc(parsed) : MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, value));
}

function verseLabel(verse: { surahNumber: number; ayahNumber: number }): string {
  return `${verse.surahNumber}:${verse.ayahNumber}`;
}

/** Compact one-line summary for the flash banner — the result's full created/skipped/errors
 * detail is visible per-item once the operator lands on the filtered draft review queue. */
function summarize(result: QuranImportResult): string {
  const parts: string[] = [];

  if (result.created.length > 0) {
    parts.push(`Imported ${result.created.map(verseLabel).join(', ')}.`);
  }
  if (result.skippedDuplicates.length > 0) {
    parts.push(`Skipped ${result.skippedDuplicates.map(verseLabel).join(', ')} (already exists).`);
  }
  if (result.errors.length > 0) {
    parts.push(`Failed ${result.errors.map(verseLabel).join(', ')}.`);
  }

  return parts.length > 0 ? parts.join(' ') : 'Nothing imported.';
}

function distinctLanguages(lists: QuranFoundationResource[][]): string[] {
  const languages = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      languages.add(item.languageName);
    }
  }
  return [...languages].sort((a, b) => a.localeCompare(b));
}

function filterByLanguage(
  list: QuranFoundationResource[],
  language: string | undefined,
): QuranFoundationResource[] {
  return language ? list.filter((item) => item.languageName === language) : list;
}

@Public()
@UseGuards(AdminUiSessionGuard)
@Controller('admin/quran-import')
export class QuranImportUiController {
  constructor(
    private readonly importService: QuranImportService,
    private readonly client: QuranFoundationClient,
  ) {}

  @Get()
  async show(
    @Query('language') language: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const next = await this.importService.peekNext().catch(() => null);
    const [translations, tafsirs] = await Promise.all([
      this.client.listTranslations().catch(() => []),
      this.client.listTafsirs().catch(() => []),
    ]);

    response.render('quran-import/index', {
      title: 'Import from Quran.Foundation',
      activeNav: 'quran-import',
      flash: readFlash(request),
      next,
      languages: distinctLanguages([translations, tafsirs]),
      selectedLanguage: language ?? '',
      translations: filterByLanguage(translations, language),
      tafsirs: filterByLanguage(tafsirs, language),
      resourceListsAvailable: translations.length > 0 || tafsirs.length > 0,
      defaults: this.client.getDefaultResourceIds(),
    });
  }

  @Post()
  async trigger(
    @Req() request: Request,
    @Res() response: Response,
    @RequestId() requestId: string,
  ): Promise<void> {
    const body = request.body as Record<string, unknown>;
    const count = clampCount(body.count);

    try {
      const result = await this.importService.importNext(count, ADMIN_UI_ACTOR, requestId, {
        translationResourceId: str(body.translationResourceId) ?? '',
        tafsirResourceId: str(body.tafsirResourceId) ?? '',
        includeWordMeanings: body.includeWordMeanings !== undefined,
      });
      const flashType =
        result.errors.length > 0 && result.created.length === 0 ? 'error' : 'success';
      setFlash(request, flashType, summarize(result));
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
    }

    response.redirect('/api/v1/admin/content?status=DRAFT&type=AYAH');
  }
}
