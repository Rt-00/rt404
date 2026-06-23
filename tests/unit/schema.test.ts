import { describe, it, expect } from 'vitest';
import { writeupSchema } from '@/lib/schema';

const valid = {
  title: 'NØVA CTF Challenge',
  platform: 'hackingclub',
  date: '2026-06-20',
  difficulty: 'medium',
  category: 'Web Exploitation',
  tags: ['vite', 'websocket'],
  flag: 'hackingclub{...}',
};

describe('writeup frontmatter schema', () => {
  it('accepts valid frontmatter and coerces the date', () => {
    const parsed = writeupSchema.parse(valid);
    expect(parsed.title).toBe('NØVA CTF Challenge');
    expect(parsed.platform).toBe('hackingclub');
    expect(parsed.date).toBeInstanceOf(Date);
    expect(parsed.date.getUTCFullYear()).toBe(2026);
  });

  it('applies defaults for tags and draft', () => {
    const parsed = writeupSchema.parse({
      title: 'Minimal',
      platform: 'hackthebox',
      date: '2026-01-02',
      difficulty: 'easy',
    });
    expect(parsed.tags).toEqual([]);
    expect(parsed.draft).toBe(false);
  });

  it('rejects an unknown platform', () => {
    const result = writeupSchema.safeParse({ ...valid, platform: 'myspace' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid difficulty', () => {
    const result = writeupSchema.safeParse({ ...valid, difficulty: 'trivial' });
    expect(result.success).toBe(false);
  });

  it('rejects missing date', () => {
    const { date: _omit, ...noDate } = valid;
    void _omit;
    const result = writeupSchema.safeParse(noDate);
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = writeupSchema.safeParse({ ...valid, title: '' });
    expect(result.success).toBe(false);
  });
});
