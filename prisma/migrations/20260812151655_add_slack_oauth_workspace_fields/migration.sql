-- AlterTable
ALTER TABLE "SlackWorkspace" ADD COLUMN     "appId" TEXT,
ADD COLUMN     "botTokenCiphertext" TEXT,
ADD COLUMN     "installedAt" TIMESTAMP(3),
ADD COLUMN     "installedByUserId" TEXT,
ADD COLUMN     "scopes" TEXT;
