-- Split the delivery model so a delivery is one message to one subscriber, not one post to one
-- channel. The channel-to-DM pivot changed who receives a message but left this table shaped for
-- a single channel post per stream per day, which made per-person duplicate prevention
-- impossible to express and made retry all-or-nothing for everyone on that day.
--
-- DeliveryRun holds what is shared by a cycle: the single content selection for a stream on a
-- calendar date, and the render produced from it. ContentDelivery becomes one row per subscriber
-- per cycle, carrying that person's own status, Slack timestamp, and retry state.
--
-- Both tables are empty at the time of this migration, so the destructive column drops below
-- lose nothing.

-- DropForeignKey
ALTER TABLE "ContentDelivery" DROP CONSTRAINT "ContentDelivery_contentId_fkey";

-- DropForeignKey
ALTER TABLE "ContentDelivery" DROP CONSTRAINT "ContentDelivery_streamId_fkey";

-- DropIndex
DROP INDEX "ContentDelivery_contentId_sentAt_idx";

-- DropIndex
DROP INDEX "ContentDelivery_streamId_deliveryLocalDate_key";

-- DropIndex
DROP INDEX "ContentDelivery_streamId_idempotencyKey_key";

-- AlterTable
ALTER TABLE "ContentDelivery" DROP COLUMN "contentId",
DROP COLUMN "deliveryLocalDate",
DROP COLUMN "idempotencyKey",
DROP COLUMN "renderedBlocks",
DROP COLUMN "renderedText",
DROP COLUMN "reservedAt",
DROP COLUMN "scheduledFor",
DROP COLUMN "skippedAt",
DROP COLUMN "streamId",
DROP COLUMN "triggerType",
ADD COLUMN     "runId" TEXT NOT NULL,
ADD COLUMN     "subscriberId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ScheduleStream" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'ar';

-- CreateTable
CREATE TABLE "DeliveryRun" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "contentId" TEXT,
    "triggerType" "DeliveryTriggerType" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryLocalDate" DATE NOT NULL,
    "idempotencyKey" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skippedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "renderedText" TEXT,
    "renderedBlocks" JSONB,
    "rendererVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryRun_contentId_createdAt_idx" ON "DeliveryRun"("contentId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryRun_status_deliveryLocalDate_idx" ON "DeliveryRun"("status", "deliveryLocalDate");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRun_streamId_deliveryLocalDate_key" ON "DeliveryRun"("streamId", "deliveryLocalDate");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryRun_streamId_idempotencyKey_key" ON "DeliveryRun"("streamId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ContentDelivery_subscriberId_createdAt_idx" ON "ContentDelivery"("subscriberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDelivery_runId_subscriberId_key" ON "ContentDelivery"("runId", "subscriberId");

-- AddForeignKey
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "ScheduleStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DeliveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "UserSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

