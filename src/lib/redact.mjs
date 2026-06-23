/**
 * Flag redaction helpers (pure, ESM so they load in both the Astro/Vite
 * markdown pipeline and Vitest).
 *
 * The goal is "never show the flag": the real characters must never reach the
 * served HTML, so we replace them at build time with a block-character censor
 * bar (then blurred via CSS for the aesthetic). We also redact the base64
 * encodings of the flag, since writeups often paste those as derivations.
 */

/** Escape a string for safe use inside a RegExp. */
export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * All secret strings to redact for a given flag: the flag itself plus its
 * base64 encodings (with and without a trailing newline). Longest first so
 * overlapping matches prefer the longer secret.
 */
export function redactionTargets(flag) {
  const set = new Set();
  if (flag) {
    set.add(flag);
    set.add(Buffer.from(flag).toString('base64'));
    set.add(Buffer.from(`${flag}\n`).toString('base64'));
  }
  return [...set].sort((a, b) => b.length - a.length);
}

/** A block-character censor bar the same visual length as `s`. */
export function blockFor(s) {
  return '█'.repeat([...s].length);
}

/** Replace every secret occurrence in `value` with a censor bar. */
export function redactString(value, secrets) {
  if (!secrets.length) return value;
  const re = new RegExp(secrets.map(escapeRegExp).join('|'), 'g');
  return value.replace(re, (m) => blockFor(m));
}
