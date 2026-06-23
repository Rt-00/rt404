import { describe, it, expect } from 'vitest';
import { redactionTargets, redactString, blockFor, escapeRegExp } from '@/lib/redact.mjs';

// Synthetic flag — the real flags live only in article frontmatter, never in
// committed test fixtures (the repo is public).
const FLAG = 'ctf{redaction_test_flag}';

describe('redactionTargets', () => {
  it('includes the flag and both base64 encodings', () => {
    const targets = redactionTargets(FLAG);
    expect(targets).toContain(FLAG);
    expect(targets).toContain('Y3Rme3JlZGFjdGlvbl90ZXN0X2ZsYWd9'); // base64(flag)
    expect(targets).toContain('Y3Rme3JlZGFjdGlvbl90ZXN0X2ZsYWd9Cg=='); // base64(flag\n)
  });

  it('orders longest-first and is empty without a flag', () => {
    const targets = redactionTargets(FLAG);
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i - 1].length).toBeGreaterThanOrEqual(targets[i].length);
    }
    expect(redactionTargets(undefined)).toEqual([]);
    expect(redactionTargets('')).toEqual([]);
  });
});

describe('redactString', () => {
  const secrets = redactionTargets(FLAG);

  it('replaces the flag and its base64 with a same-length censor bar', () => {
    const out = redactString(`flag is ${FLAG} done`, secrets);
    expect(out).not.toContain(FLAG);
    expect(out).toContain('█'.repeat(FLAG.length));
  });

  it('redacts the base64 derivation', () => {
    const b64 = 'Y3Rme3JlZGFjdGlvbl90ZXN0X2ZsYWd9Cg==';
    const out = redactString(`data:${b64}`, secrets);
    expect(out).not.toContain(b64);
  });

  it('leaves unrelated text untouched and handles no secrets', () => {
    expect(redactString('nothing secret here', secrets)).toBe('nothing secret here');
    expect(redactString(FLAG, [])).toBe(FLAG);
  });
});

describe('helpers', () => {
  it('blockFor matches code-point length', () => {
    expect(blockFor('abc')).toBe('███');
  });

  it('escapeRegExp escapes regex metacharacters', () => {
    expect(escapeRegExp('a{b}')).toBe('a\\{b\\}');
  });
});
