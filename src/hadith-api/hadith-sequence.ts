export interface HadithCursorPosition {
  bookIndex: number;
  statusIndex: number;
  page: number;
  itemIndex: number;
}

export interface HadithPageMeta {
  /** Number of items in the currently fetched page's `data` array (0 for an empty or 404 combo). */
  dataLength: number;
  /** The API's own `last_page` for this book/status combo (0 for an empty or 404 combo). */
  lastPage: number;
}

/**
 * Given the position a page was just fetched for and that page's metadata, returns the NEXT
 * position to process — regardless of whether `current.itemIndex` actually held a real item
 * (the caller decides that separately by comparing `current.itemIndex` against
 * `pageMeta.dataLength`; this function only computes where the walk goes from here). Unlike
 * `nextVerseAfter` (a pure function of a static ayah-count table, so it can express "last
 * processed"), this walk depends on live pagination metadata, so `HadithImportCursor` stores the
 * NEXT position directly and this function always returns that next position, one step past
 * `current`.
 *
 * Advance order: next item in the page, else next page in the combo (via the API's `lastPage`),
 * else next status for the same book, else next book (wrapping to book 0 after the last book's
 * last status) — which also transparently skips an empty/404 combo, since `dataLength: 0,
 * lastPage: 0` falls through every branch immediately to "next status/book" without a special
 * case. Dedup at the content layer makes a wrapped-around re-visit harmless.
 */
export function nextHadithPosition(
  current: HadithCursorPosition,
  bookCount: number,
  statusCount: number,
  pageMeta: HadithPageMeta,
): HadithCursorPosition {
  if (current.itemIndex + 1 < pageMeta.dataLength) {
    return { ...current, itemIndex: current.itemIndex + 1 };
  }

  if (current.page < pageMeta.lastPage) {
    return { ...current, page: current.page + 1, itemIndex: 0 };
  }

  if (current.statusIndex + 1 < statusCount) {
    return { ...current, statusIndex: current.statusIndex + 1, page: 1, itemIndex: 0 };
  }

  const nextBookIndex = current.bookIndex + 1 < bookCount ? current.bookIndex + 1 : 0;
  return { bookIndex: nextBookIndex, statusIndex: 0, page: 1, itemIndex: 0 };
}
