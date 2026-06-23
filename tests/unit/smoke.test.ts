import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('scaffold smoke test', () => {
  it('runs the unit test runner', () => {
    expect(1 + 1).toBe(2);
  });

  it('cn() merges and dedupes Tailwind classes', () => {
    const isHidden = false;
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-green-500', isHidden && 'hidden', 'font-mono')).toBe(
      'text-green-500 font-mono',
    );
  });
});
