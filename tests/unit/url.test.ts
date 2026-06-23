import { describe, it, expect } from 'vitest';
import { joinBase } from '@/lib/url';

describe('joinBase', () => {
  it('joins root base without double slashes', () => {
    expect(joinBase('/', '/')).toBe('/');
    expect(joinBase('/', '/archive')).toBe('/archive');
    expect(joinBase('/', 'archive')).toBe('/archive');
  });

  it('joins a project-page base', () => {
    expect(joinBase('/rt404/', '/')).toBe('/rt404');
    expect(joinBase('/rt404/', '/archive')).toBe('/rt404/archive');
    expect(joinBase('/rt404', 'archive')).toBe('/rt404/archive');
  });
});
