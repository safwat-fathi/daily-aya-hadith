import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ContentType, SourceType } from '../generated/prisma/enums';

interface ChecksumSource {
  sourceType: SourceType;
  title: string;
  author?: string | null;
  publisher?: string | null;
  edition?: string | null;
  volume?: string | null;
  page?: string | null;
  chapter?: string | null;
  referenceNumber?: string | null;
  url?: string | null;
  notes?: string | null;
  sortOrder: number;
}

interface ChecksumContent {
  type: ContentType;
  locale: string;
  title: string | null;
  payload: unknown;
  version: number;
  sources: ChecksumSource[];
}

/**
 * Interfaces are erased at runtime, so a caller passing a Prisma row satisfies
 * `ChecksumSource` while still carrying `id`, `contentId` and timestamps. Hashing those
 * would make the checksum a fingerprint of the row rather than of the content, so every
 * copy (a revision, or a delete-and-recreate edit) would hash differently even when the
 * bibliographic data is identical. Project explicitly before hashing.
 */
function projectSource(source: ChecksumSource): ChecksumSource {
  return {
    sourceType: source.sourceType,
    title: source.title,
    author: source.author ?? null,
    publisher: source.publisher ?? null,
    edition: source.edition ?? null,
    volume: source.volume ?? null,
    page: source.page ?? null,
    chapter: source.chapter ?? null,
    referenceNumber: source.referenceNumber ?? null,
    url: source.url ?? null,
    notes: source.notes ?? null,
    sortOrder: source.sortOrder,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

@Injectable()
export class ContentChecksumService {
  calculate(content: ChecksumContent): string {
    const canonical = canonicalize({
      type: content.type,
      locale: content.locale,
      title: content.title,
      payload: content.payload,
      version: content.version,
      sources: [...content.sources]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map(projectSource),
    });

    return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
  }
}
