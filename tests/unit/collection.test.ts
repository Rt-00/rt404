import { describe, it, expect } from 'vitest';
import {
  visibleEntries,
  sortByDateDesc,
  publishedSorted,
  latest,
  type WriteupEntry,
} from '@/lib/collection';

function entry(id: string, date: string, draft = false): WriteupEntry {
  return {
    id,
    data: {
      title: id,
      platform: 'hackthebox',
      date: new Date(date),
      difficulty: 'easy',
      tags: [],
      draft,
    },
  };
}

const entries = [
  entry('a', '2026-01-01'),
  entry('b', '2026-06-20'),
  entry('c', '2025-12-31', true), // draft
];

describe('collection helpers', () => {
  it('hides drafts by default and shows them when included', () => {
    expect(visibleEntries(entries, false).map((e) => e.id)).toEqual(['a', 'b']);
    expect(visibleEntries(entries, true).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts newest-first without mutating input', () => {
    const copy = [...entries];
    expect(sortByDateDesc(entries).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(entries).toEqual(copy);
  });

  it('publishedSorted filters drafts then sorts desc', () => {
    expect(publishedSorted(entries, false).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('latest returns the N most recent visible entries', () => {
    expect(latest(entries, false, 1).map((e) => e.id)).toEqual(['b']);
    expect(latest(entries, false, 10).map((e) => e.id)).toEqual(['b', 'a']);
    expect(latest(entries, false, 0)).toEqual([]);
    expect(latest(entries, true, 2).map((e) => e.id)).toEqual(['b', 'a']);
  });
});
