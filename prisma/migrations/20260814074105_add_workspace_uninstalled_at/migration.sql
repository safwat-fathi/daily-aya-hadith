-- DropIndex
DROP INDEX "SlackWorkspace_isActive_idx";

-- AlterTable
ALTER TABLE "SlackWorkspace" ADD COLUMN     "uninstalledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SlackWorkspace_isActive_uninstalledAt_idx" ON "SlackWorkspace"("isActive", "uninstalledAt");
