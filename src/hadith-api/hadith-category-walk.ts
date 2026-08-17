/**
 * Minimal structural shape this module needs from a HadeethEnc category node — deliberately not
 * importing `hadith-api.client.ts`'s raw wire type, so this stays a pure, client-independent
 * module (same independence the deleted `hadith-sequence.ts` had from the old hadithapi.com
 * client). `id`/`hadeeths_count` arrive from the API as JSON strings; callers pass them through
 * unconverted.
 */
export interface CategoryCount {
  id: string;
  hadeeths_count: string | number;
}

export interface HadeethCategoryPosition {
  /** '' = nothing imported yet, start at the first id in a fresh flattening. */
  categoryId: string;
  page: number;
  itemIndex: number;
}

export interface HadeethPageMeta {
  /** Number of items in the currently fetched page's `data` array. */
  dataLength: number;
  /** The API's own `last_page` for this category. */
  lastPage: number;
}

/**
 * `/categories/list/` returns a FLAT array of every category (verified live: 452 categories with
 * hadeeths_count > 0, only 7 with a null parent_id) — NOT a nested tree, despite the name. There
 * is no `children` field on any node to recurse into. "Flattening" here is just filtering to
 * categories that actually have content, in a deterministic order: numeric id ascending. A
 * `parent_id`-based topical-grouping traversal was considered and rejected — it adds real
 * complexity (an adjacency map, orphaned-parent handling) for an ordering property nothing in
 * this system requires; the delivery layer already picks content by least-recently-sent, not
 * import order.
 *
 * Walking every id (leaf and non-leaf alike) is deliberate: verified live that a non-leaf
 * category's hadeeths_count does not simply roll up its children's counts (id 1's own 81 directly
 * -listable hadiths is less than its five children's counts summed to 86), so a leaf-only walk
 * risks silently never reaching hadiths tagged only at a parent level. Over-visiting a pure-rollup
 * category just produces harmless `skippedDuplicates` at the content layer — correctness holds
 * either way, only efficiency varies.
 */
export function flattenCategoryIds(nodes: readonly CategoryCount[]): string[] {
  return nodes
    .filter((node) => Number(node.hadeeths_count) > 0)
    .map((node) => node.id)
    .sort((a, b) => Number(a) - Number(b));
}

/**
 * Given the position a page was just fetched for and that page's metadata, returns the NEXT
 * position to process — mirrors the deleted `nextHadithPosition`'s role, adapted for a live
 * -refetched category list instead of fixed book/status arrays. `categoryIds` must be a FRESH
 * flattening (the caller re-fetches the category list once per `importNext()` call, not once per
 * category boundary — see `hadith-import.service.ts`).
 *
 * Advance order: next item on the page, else next page in the category (still depends on live
 * pagination metadata, same reasoning the old cursor had for storing the next position directly),
 * else the next id in a fresh flattening. If the stored `categoryId` isn't found there (deleted or
 * restructured upstream), restart at the first id rather than guessing a "nearest" replacement —
 * simpler, still always makes forward progress, and dedup absorbs any resulting re-visit.
 */
export function nextHadeethCategoryPosition(
  current: HadeethCategoryPosition,
  categoryIds: readonly string[],
  pageMeta: HadeethPageMeta,
): HadeethCategoryPosition {
  if (current.itemIndex + 1 < pageMeta.dataLength) {
    return { ...current, itemIndex: current.itemIndex + 1 };
  }

  if (current.page < pageMeta.lastPage) {
    return { ...current, page: current.page + 1, itemIndex: 0 };
  }

  if (current.categoryId === '') {
    return { categoryId: categoryIds[0] ?? '', page: 1, itemIndex: 0 };
  }

  const idx = categoryIds.indexOf(current.categoryId);
  const nextId = idx === -1 ? categoryIds[0] : categoryIds[(idx + 1) % categoryIds.length];
  return { categoryId: nextId ?? '', page: 1, itemIndex: 0 };
}
