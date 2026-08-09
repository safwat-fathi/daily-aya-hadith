export interface VersePosition {
  surah: number;
  ayah: number;
}

export interface ImportCursorPosition {
  lastSurahNumber: number;
  lastAyahNumber: number;
}

/**
 * Advances sequentially through the Mushaf: 1:1 → 1:2 → … → 1:7 → 2:1 → … → 114:6, then wraps
 * back to 1:1. `cursor.lastSurahNumber === 0` is the "nothing imported yet" sentinel.
 */
export function nextVerseAfter(
  cursor: ImportCursorPosition,
  ayahCounts: readonly number[],
): VersePosition {
  if (cursor.lastSurahNumber === 0) {
    return { surah: 1, ayah: 1 };
  }

  const maxAyah = ayahCounts[cursor.lastSurahNumber - 1];

  if (cursor.lastAyahNumber < maxAyah) {
    return { surah: cursor.lastSurahNumber, ayah: cursor.lastAyahNumber + 1 };
  }

  const nextSurah = cursor.lastSurahNumber < ayahCounts.length ? cursor.lastSurahNumber + 1 : 1;
  return { surah: nextSurah, ayah: 1 };
}
