-- CreateTable
CREATE TABLE "QuranImportCursor" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastSurahNumber" INTEGER NOT NULL DEFAULT 0,
    "lastAyahNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuranImportCursor_pkey" PRIMARY KEY ("id")
);
