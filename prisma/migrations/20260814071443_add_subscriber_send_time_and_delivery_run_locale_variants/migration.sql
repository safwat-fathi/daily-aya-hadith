-- AlterTable
ALTER TABLE "DeliveryRun" ADD COLUMN     "renderedBlocksEn" JSONB,
ADD COLUMN     "renderedTextEn" TEXT;

-- AlterTable
ALTER TABLE "UserSubscriber" ADD COLUMN     "sendTime" TEXT;
