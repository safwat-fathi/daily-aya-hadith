-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('AYAH', 'HADITH', 'COMPANION_STORY', 'BLESSING_REMINDER');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('QURAN', 'HADITH_COLLECTION', 'TAFSIR', 'ASBAB_AL_NUZUL', 'SEERAH', 'BIOGRAPHY', 'BOOK', 'WEBSITE', 'OTHER');

-- CreateEnum
CREATE TYPE "ScheduleFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "SelectionStrategy" AS ENUM ('LEAST_RECENTLY_SENT', 'RANDOM_WITHOUT_REPLACEMENT');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DeliveryTriggerType" AS ENUM ('SCHEDULED', 'MANUAL', 'RETRY');

-- CreateTable
CREATE TABLE "SlackWorkspace" (
    "id" TEXT NOT NULL,
    "slackTeamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "botUserId" TEXT,
    "tokenSecretKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tokenLastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "channelName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "footerText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleStream" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" "ScheduleFrequency" NOT NULL,
    "sendTime" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "daysOfWeek" INTEGER[],
    "allowedContentTypes" "ContentType"[],
    "selectionStrategy" "SelectionStrategy" NOT NULL DEFAULT 'LEAST_RECENTLY_SENT',
    "maxAutomaticAttempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "title" TEXT,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentContentId" TEXT,
    "contentChecksum" TEXT,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "submittedForReviewAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentSource" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publisher" TEXT,
    "edition" TEXT,
    "volume" TEXT,
    "page" TEXT,
    "chapter" TEXT,
    "referenceNumber" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDelivery" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "contentId" TEXT,
    "triggerType" "DeliveryTriggerType" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryLocalDate" DATE NOT NULL,
    "idempotencyKey" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendingAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "slackMessageTs" TEXT,
    "slackChannelId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "isRetryable" BOOLEAN,
    "renderedText" TEXT,
    "renderedBlocks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlackWorkspace_slackTeamId_key" ON "SlackWorkspace"("slackTeamId");

-- CreateIndex
CREATE INDEX "SlackWorkspace_isActive_idx" ON "SlackWorkspace"("isActive");

-- CreateIndex
CREATE INDEX "ChannelSubscription_isEnabled_idx" ON "ChannelSubscription"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSubscription_workspaceId_slackChannelId_key" ON "ChannelSubscription"("workspaceId", "slackChannelId");

-- CreateIndex
CREATE INDEX "ScheduleStream_isEnabled_frequency_idx" ON "ScheduleStream"("isEnabled", "frequency");

-- CreateIndex
CREATE INDEX "ScheduleStream_subscriptionId_idx" ON "ScheduleStream"("subscriptionId");

-- CreateIndex
CREATE INDEX "ContentItem_status_type_locale_idx" ON "ContentItem"("status", "type", "locale");

-- CreateIndex
CREATE INDEX "ContentItem_parentContentId_idx" ON "ContentItem"("parentContentId");

-- CreateIndex
CREATE INDEX "ContentItem_approvedAt_idx" ON "ContentItem"("approvedAt");

-- CreateIndex
CREATE INDEX "ContentSource_contentId_sortOrder_idx" ON "ContentSource"("contentId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContentDelivery_status_nextRetryAt_idx" ON "ContentDelivery"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "ContentDelivery_contentId_sentAt_idx" ON "ContentDelivery"("contentId", "sentAt");

-- CreateIndex
CREATE INDEX "ContentDelivery_subscriptionId_createdAt_idx" ON "ContentDelivery"("subscriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDelivery_streamId_deliveryLocalDate_key" ON "ContentDelivery"("streamId", "deliveryLocalDate");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDelivery_streamId_idempotencyKey_key" ON "ContentDelivery"("streamId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChannelSubscription" ADD CONSTRAINT "ChannelSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleStream" ADD CONSTRAINT "ScheduleStream_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ChannelSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_parentContentId_fkey" FOREIGN KEY ("parentContentId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentSource" ADD CONSTRAINT "ContentSource_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "ScheduleStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ChannelSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDelivery" ADD CONSTRAINT "ContentDelivery_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "SlackWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
