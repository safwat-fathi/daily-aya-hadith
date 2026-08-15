import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { RequestId } from '../common/decorators/request-id.decorator';
import {
  HadithImportService,
  type HadithImportPreview,
  type HadithImportResult,
} from '../hadith-api/hadith-import.service';
import { AdminUiSessionGuard } from './admin-ui-session.guard';
import { ADMIN_UI_ACTOR } from './constants';
import { extractErrorMessage, readFlash, setFlash } from './flash';

const MIN_COUNT = 1;
const MAX_COUNT = 100;

function clampCount(raw: unknown): number {
  const parsed = Number(raw);
  const value = Number.isFinite(parsed) ? Math.trunc(parsed) : MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, value));
}

function hadithLabel(item: { bookSlug: string; hadithNumber?: string }): string {
  return item.hadithNumber ? `${item.bookSlug} #${item.hadithNumber}` : item.bookSlug;
}

function hadithErrorLabel(item: {
  bookSlug: string;
  hadithNumber?: string;
  message: string;
}): string {
  return `${hadithLabel(item)} (${item.message})`;
}

/** Compact one-line summary for the flash banner — the result's full per-bucket detail is
 * visible per-item once the operator lands on the filtered draft review queue. */
function summarize(result: HadithImportResult): string {
  const parts: string[] = [];

  if (result.created.length > 0) {
    parts.push(`Imported ${result.created.map(hadithLabel).join(', ')}.`);
  }
  if (result.skippedDuplicates.length > 0) {
    parts.push(`Skipped ${result.skippedDuplicates.map(hadithLabel).join(', ')} (already exists).`);
  }
  if (result.skippedNoEnglish.length > 0) {
    parts.push(`Skipped ${result.skippedNoEnglish.map(hadithLabel).join(', ')} (no English text).`);
  }
  if (result.errors.length > 0) {
    parts.push(`Failed ${result.errors.map(hadithErrorLabel).join(', ')}.`);
  }

  return parts.length > 0 ? parts.join(' ') : 'Nothing imported.';
}

@Public()
@UseGuards(AdminUiSessionGuard)
@Controller('admin/hadith-import')
export class HadithImportUiController {
  constructor(private readonly importService: HadithImportService) {}

  @Get()
  async show(@Req() request: Request, @Res() response: Response): Promise<void> {
    const next: HadithImportPreview | null = await this.importService.peekNext().catch(() => null);

    response.render('hadith-import/index', {
      title: 'Import from hadithapi.com',
      activeNav: 'hadith-import',
      flash: readFlash(request),
      next,
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
      const result = await this.importService.importNext(count, ADMIN_UI_ACTOR, requestId);
      const flashType =
        result.errors.length > 0 && result.created.length === 0 ? 'error' : 'success';
      setFlash(request, flashType, summarize(result));
    } catch (error) {
      setFlash(request, 'error', extractErrorMessage(error));
    }

    response.redirect('/api/v1/admin/content?status=DRAFT&type=HADITH');
  }
}
