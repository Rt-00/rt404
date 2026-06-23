import type { WriteupEntry } from './collection';
import { sortByDateDesc } from './collection';
import { monthName } from './format';

export interface PlatformGroup {
  platform: string;
  count: number;
  entries: WriteupEntry[];
}

/**
 * Group entries by their `platform`, newest-first within each group and
 * groups ordered by descending entry count (ties broken alphabetically).
 * Does not mutate the input.
 */
export function groupByPlatform<T extends WriteupEntry>(entries: T[]): PlatformGroup[] {
  const byPlatform = new Map<string, T[]>();
  for (const entry of entries) {
    const list = byPlatform.get(entry.data.platform) ?? [];
    list.push(entry);
    byPlatform.set(entry.data.platform, list);
  }

  return [...byPlatform.entries()]
    .map(([platform, list]) => ({
      platform,
      count: list.length,
      entries: sortByDateDesc(list),
    }))
    .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Distinct tags across entries, ordered by count desc then alphabetically. */
export function collectTags<T extends WriteupEntry>(entries: T[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Entries carrying a given tag, newest-first. */
export function entriesForTag<T extends WriteupEntry>(entries: T[], tag: string): T[] {
  return sortByDateDesc(entries.filter((e) => e.data.tags.includes(tag)));
}

export interface MonthGroup {
  year: number;
  /** 1-12 */
  month: number;
  /** Zero-padded month, e.g. "06" — used in URLs. */
  slug: string;
  /** PT-BR label, e.g. "junho de 2026". */
  label: string;
  count: number;
  entries: WriteupEntry[];
}

export interface YearGroup {
  year: number;
  count: number;
  months: MonthGroup[];
}

/**
 * Group entries by year+month (UTC), most recent first, entries within each
 * month newest-first. Does not mutate the input.
 */
export function groupByMonthYear<T extends WriteupEntry>(entries: T[]): MonthGroup[] {
  const byKey = new Map<string, T[]>();
  for (const entry of entries) {
    const d = entry.data.date;
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const list = byKey.get(key) ?? [];
    list.push(entry);
    byKey.set(key, list);
  }

  return [...byKey.values()]
    .map((list) => {
      const d = list[0].data.date;
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      return {
        year,
        month,
        slug: String(month).padStart(2, '0'),
        label: `${monthName(month - 1)} de ${year}`,
        count: list.length,
        entries: sortByDateDesc(list),
      };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

/** Nest month groups under their year, most recent year first. */
export function groupByYear<T extends WriteupEntry>(entries: T[]): YearGroup[] {
  const months = groupByMonthYear(entries);
  const byYear = new Map<number, MonthGroup[]>();
  for (const m of months) {
    const list = byYear.get(m.year) ?? [];
    list.push(m);
    byYear.set(m.year, list);
  }
  return [...byYear.entries()]
    .map(([year, ms]) => ({
      year,
      count: ms.reduce((sum, m) => sum + m.count, 0),
      months: ms,
    }))
    .sort((a, b) => b.year - a.year);
}
