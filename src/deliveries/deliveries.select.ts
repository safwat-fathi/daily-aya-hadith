import type { Prisma } from '../generated/prisma/client';

/**
 * Everything `DeliveryOrchestratorService.sendDelivery` needs in one row: the run for its
 * snapshots (`renderedText`/`renderedBlocks`, and the `'en'` counterparts `renderedTextEn`/
 * `renderedBlocksEn`) and stream (`workspaceId`, `maxAutomaticAttempts`), and the subscriber for
 * their Slack user ID and `locale` (which snapshot they get).
 */
export const deliveryWithContextArgs = {
  include: {
    run: {
      include: {
        stream: true,
      },
    },
    subscriber: true,
  },
} satisfies Prisma.ContentDeliveryDefaultArgs;

export type DeliveryWithContext = Prisma.ContentDeliveryGetPayload<typeof deliveryWithContextArgs>;

/** `GET /deliveries` list rows: a delivery alone doesn't say which content or date it belongs to. */
export const deliveryListArgs = {
  include: {
    run: {
      select: {
        id: true,
        streamId: true,
        contentId: true,
        deliveryLocalDate: true,
        triggerType: true,
      },
    },
  },
} satisfies Prisma.ContentDeliveryDefaultArgs;

export type DeliveryListEntry = Prisma.ContentDeliveryGetPayload<typeof deliveryListArgs>;

/** `GET /runs/:id`: the cycle plus every subscriber's outcome, for diagnosing partial failures. */
export const runDetailArgs = {
  include: {
    deliveries: {
      orderBy: { createdAt: 'asc' },
    },
    content: {
      select: { id: true, type: true, title: true, status: true },
    },
  },
} satisfies Prisma.DeliveryRunDefaultArgs;

export type RunDetail = Prisma.DeliveryRunGetPayload<typeof runDetailArgs>;
