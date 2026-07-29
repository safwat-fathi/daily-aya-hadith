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

/**
 * A delivery row records one subscriber's copy of a cycle and no longer carries the content or
 * the date itself, so delivery history has to read those through the parent run.
 */
export const deliveryHistoryArgs = {
  include: {
    run: {
      select: {
        id: true,
        streamId: true,
        deliveryLocalDate: true,
        triggerType: true,
        rendererVersion: true,
      },
    },
  },
} satisfies Prisma.ContentDeliveryDefaultArgs;

export type DeliveryHistoryEntry = Prisma.ContentDeliveryGetPayload<typeof deliveryHistoryArgs>;
