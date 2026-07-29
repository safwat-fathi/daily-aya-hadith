/*
  Warnings:

  - You are about to drop the column `subscriptionId` on the `ContentDelivery` table. All the data in the column will be lost.
  - You are about to drop the column `subscriptionId` on the `ScheduleStream` table. All the data in the column will be lost.
  - You are about to drop the `ChannelSubscription` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `workspaceId` to the `ScheduleStream` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ChannelSubscription" DROP CONSTRAINT "ChannelSubscription_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "ContentDelivery" DROP CONSTRAINT "ContentDelivery_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduleStream" DROP CONSTRAINT "ScheduleStream_subscriptionId_fkey";

-- DropIndex
DROP INDEX "ContentDelivery_subscriptionId_createdAt_idx";

-- DropIndex
DROP INDEX "ScheduleStream_subscriptionId_idx";

-- AlterTable
ALTER TABLE "ContentDelivery" DROP COLUMN "subscriptionId";

-- AlterTable
ALTER TABLE "ScheduleStream" DROP COLUMN "subscriptionId",
ADD COLUMN     "workspaceId" TEXT NOT NULL;

-- DropTable
DROP TABLE "ChannelSubscription";

-- CreateTable
CREATE TABLE "UserSubscriber" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slackUserId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserSubscriber_isActive_idx" ON "UserSubscriber"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscriber_workspaceId_slackUserId_key" ON "UserSubscriber"("workspaceId", "slackUserId");

-- CreateIndex
CREATE INDEX "ScheduleStream_workspaceId_idx" ON "ScheduleStream"("workspaceId");

-- AddForeignKey
ALTER TABLE "UserSubscriber" ADD CONSTRAINT "UserSubscriber_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleStream" ADD CONSTRAINT "ScheduleStream_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
