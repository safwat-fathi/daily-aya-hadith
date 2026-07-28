-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_parentContentId_version_key" ON "ContentItem"("parentContentId", "version");

