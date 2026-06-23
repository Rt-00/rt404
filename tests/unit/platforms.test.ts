import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  PLATFORM_IDS,
  getPlatform,
  platformName,
  platformColor,
} from '@/lib/platforms';

describe('platform registry', () => {
  it('exposes a non-empty list of platforms', () => {
    expect(PLATFORMS.length).toBeGreaterThan(0);
    expect(PLATFORM_IDS.length).toBe(PLATFORMS.length);
  });

  it('has unique ids', () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes the platforms the user asked for', () => {
    expect(PLATFORM_IDS).toEqual(
      expect.arrayContaining(['tryhackme', 'hackthebox', 'hackingclub']),
    );
  });

  it('resolves a known platform by id', () => {
    expect(getPlatform('hackthebox')?.name).toBe('Hack The Box');
    expect(platformName('hackthebox')).toBe('Hack The Box');
    expect(platformColor('hackthebox')).toBe('#9fef00');
  });

  it('returns undefined / fallbacks for unknown ids', () => {
    expect(getPlatform('nope')).toBeUndefined();
    expect(platformName('nope')).toBe('nope');
    expect(platformColor('nope')).toBe('#94a3b8');
  });
});
