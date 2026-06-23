import { describe, it, expect } from 'vitest';
import { collectTags, entriesForTag } from '@/lib/group';
import type { WriteupEntry } from '@/lib/collection';

function entry(id: string, date: string, tags: string[]): WriteupEntry {
  return {
    id,
    data: {
      title: id,
      platform: 'hackthebox',
      date: new Date(date),
      difficulty: 'easy',
      tags,
      draft: false,
    },
  };
}

const entries = [
  entry('a', '2026-01-01', ['web', 'vite']),
  entry('b', '2026-06-20', ['web', 'websocket']),
  entry('c', '2026-03-03', ['crypto']),
];

describe('collectTags', () => {
  it('counts distinct tags, ordered by count desc then alpha', () => {
    expect(collectTags(entries)).toEqual([
      { tag: 'web', count: 2 },
      { tag: 'crypto', count: 1 },
      { tag: 'vite', count: 1 },
      { tag: 'websocket', count: 1 },
    ]);
  });

  it('returns an empty array when there are no tags', () => {
    expect(collectTags([entry('x', '2026-01-01', [])])).toEqual([]);
  });
});

describe('entriesForTag', () => {
  it('returns entries carrying the tag, newest-first', () => {
    expect(entriesForTag(entries, 'web').map((e) => e.id)).toEqual(['b', 'a']);
    expect(entriesForTag(entries, 'crypto').map((e) => e.id)).toEqual(['c']);
    expect(entriesForTag(entries, 'none')).toEqual([]);
  });
});
