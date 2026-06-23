import { describe, it, expect } from 'vitest';
import { groupByPlatform } from '@/lib/group';
import type { WriteupEntry } from '@/lib/collection';

function entry(id: string, platform: string, date: string): WriteupEntry {
  return {
    id,
    data: {
      title: id,
      platform: platform as WriteupEntry['data']['platform'],
      date: new Date(date),
      difficulty: 'easy',
      tags: [],
      draft: false,
    },
  };
}

describe('groupByPlatform', () => {
  const entries = [
    entry('a', 'hackthebox', '2026-01-01'),
    entry('b', 'hackthebox', '2026-06-20'),
    entry('c', 'tryhackme', '2026-03-03'),
  ];

  it('groups entries by platform with counts', () => {
    const groups = groupByPlatform(entries);
    expect(groups).toHaveLength(2);
    const htb = groups.find((g) => g.platform === 'hackthebox');
    expect(htb?.count).toBe(2);
  });

  it('orders groups by count desc, entries by date desc', () => {
    const groups = groupByPlatform(entries);
    expect(groups.map((g) => g.platform)).toEqual(['hackthebox', 'tryhackme']);
    expect(groups[0].entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('breaks count ties alphabetically by platform', () => {
    const tied = [
      entry('x', 'vulnlab', '2026-01-01'),
      entry('y', 'picoctf', '2026-01-01'),
    ];
    expect(groupByPlatform(tied).map((g) => g.platform)).toEqual(['picoctf', 'vulnlab']);
  });

  it('returns an empty array for no entries', () => {
    expect(groupByPlatform([])).toEqual([]);
  });
});
