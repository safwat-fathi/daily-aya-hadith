import type { Prisma } from '../generated/prisma/client';

export const contentDetailArgs = {
  include: {
    sources: {
      orderBy: {
        sortOrder: 'asc',
      },
    },
    revisions: {
      orderBy: {
        version: 'asc',
      },
      select: {
        id: true,
        type: true,
        status: true,
        locale: true,
        title: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    },
  },
} satisfies Prisma.ContentItemDefaultArgs;

export type ContentDetail = Prisma.ContentItemGetPayload<typeof contentDetailArgs>;

export const contentSummarySelect = {
  id: true,
  type: true,
  status: true,
  locale: true,
  title: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContentItemSelect;

export type ContentSummary = Prisma.ContentItemGetPayload<{
  select: typeof contentSummarySelect;
}>;
