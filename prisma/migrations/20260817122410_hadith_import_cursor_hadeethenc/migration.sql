-- Switches HadithImportCursor from the hadithapi.com book/status walk to the HadeethEnc
-- category walk. Drops bookIndex/statusIndex (meaningless once the source API changes — indexed
-- a fixed array that no longer exists) and adds categoryId (the live category id currently being
-- walked, not an index). This resets the singleton row's resume position; it does not touch any
-- ContentItem data.
ALTER TABLE "HadithImportCursor" DROP COLUMN "bookIndex",
DROP COLUMN "statusIndex",
ADD COLUMN "categoryId" TEXT NOT NULL DEFAULT '';
