-- CreateTable
CREATE TABLE "HadithImportCursor" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "bookIndex" INTEGER NOT NULL DEFAULT 0,
    "statusIndex" INTEGER NOT NULL DEFAULT 0,
    "page" INTEGER NOT NULL DEFAULT 1,
    "itemIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HadithImportCursor_pkey" PRIMARY KEY ("id")
);
