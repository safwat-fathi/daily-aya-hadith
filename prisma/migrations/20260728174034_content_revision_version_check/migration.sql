-- Complete the revision-family invariant that "ContentItem_parentContentId_version_key"
-- cannot express on its own. PostgreSQL treats every NULL "parentContentId" as distinct,
-- so that unique index only constrains revisions sharing a parent; it says nothing about
-- the root row of a family. Pinning roots to version 1 and revisions to version >= 2 means
-- no revision can collide with its root, so "version" is unique across a whole family.
-- Prisma schema syntax cannot express CHECK constraints, so this is applied as custom SQL.
ALTER TABLE "ContentItem"
  ADD CONSTRAINT "ContentItem_revision_version_check"
  CHECK (
    ("parentContentId" IS NULL AND "version" = 1)
    OR ("parentContentId" IS NOT NULL AND "version" > 1)
  );
