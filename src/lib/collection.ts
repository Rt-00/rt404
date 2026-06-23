import type { WriteupData } from './schema';

/** Minimal shape of a content-collection entry used by these helpers. */
export interface WriteupEntry {
  id: string;
  data: WriteupData;
}

/**
 * Filter out drafts unless explicitly included (drafts are shown in dev,
 * hidden in production builds).
 */
export function visibleEntries<T extends WriteupEntry>(
  entries: T[],
  includeDrafts: boolean,
): T[] {
  return includeDrafts ? entries : entries.filter((e) => !e.data.draft);
}

/** Sort entries newest-first by frontmatter date (does not mutate input). */
export function sortByDateDesc<T extends WriteupEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/** Convenience: visible entries, newest-first. */
export function publishedSorted<T extends WriteupEntry>(
  entries: T[],
  includeDrafts: boolean,
): T[] {
  return sortByDateDesc(visibleEntries(entries, includeDrafts));
}

/** The N most recent visible entries (N <= 0 returns an empty list). */
export function latest<T extends WriteupEntry>(
  entries: T[],
  includeDrafts: boolean,
  limit: number,
): T[] {
  if (limit <= 0) return [];
  return publishedSorted(entries, includeDrafts).slice(0, limit);
}
