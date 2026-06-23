import { describe, it, expect } from 'vitest';
import { groupByMonthYear, groupByYear } from '@/lib/group';
import type { WriteupEntry } from '@/lib/collection';

function entry(id: string, date: string): WriteupEntry {
  return {
    id,
    data: {
      title: id,
      platform: 'hackthebox',
      date: new Date(date),
      difficulty: 'easy',
      tags: [],
      draft: false,
    },
  };
}

const entries = [
  entry('a', '2026-06-20'),
  entry('b', '2026-06-02'),
  entry('c', '2026-01-15'),
  entry('d', '2025-12-31'),
];

describe('groupByMonthYear', () => {
  it('groups by year+month, most recent first', () => {
    const groups = groupByMonthYear(entries);
    expect(groups.map((g) => `${g.year}-${g.slug}`)).toEqual([
      '2026-06',
      '2026-01',
      '2025-12',
    ]);
  });

  it('zero-pads month slug and builds a PT-BR label', () => {
    const jan = groupByMonthYear(entries).find((g) => g.month === 1)!;
    expect(jan.slug).toBe('01');
    expect(jan.label).toBe('janeiro de 2026');
  });

  it('orders entries within a month newest-first and counts them', () => {
    const june = groupByMonthYear(entries).find((g) => g.month === 6)!;
    expect(june.count).toBe(2);
    expect(june.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('groupByYear', () => {
  it('nests months under years with aggregated counts', () => {
    const years = groupByYear(entries);
    expect(years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(years[0].count).toBe(3);
    expect(years[0].months.map((m) => m.slug)).toEqual(['06', '01']);
  });
});
