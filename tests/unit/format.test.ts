import { describe, it, expect } from 'vitest';
import { formatDate, isoDate, monthName, difficultyLabel } from '@/lib/format';

describe('format helpers', () => {
  it('formats a full PT-BR date', () => {
    const out = formatDate(new Date('2026-06-20'));
    expect(out).toContain('20');
    expect(out).toContain('junho');
    expect(out).toContain('2026');
  });

  it('formats an ISO date without timezone drift', () => {
    expect(isoDate(new Date('2026-06-20'))).toBe('2026-06-20');
  });

  it('returns PT-BR month names (0-indexed)', () => {
    expect(monthName(0)).toBe('janeiro');
    expect(monthName(5)).toBe('junho');
    expect(monthName(11)).toBe('dezembro');
  });

  it('capitalizes difficulty', () => {
    expect(difficultyLabel('medium')).toBe('Medium');
    expect(difficultyLabel('insane')).toBe('Insane');
  });
});
