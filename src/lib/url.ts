/**
 * Join Astro's `base` path with an app-relative path, avoiding double slashes.
 * Pure helper so it can be unit-tested without the Astro runtime.
 */
export function joinBase(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  const joined = `${b}${p}`;
  return joined === '' ? '/' : joined;
}

/** `joinBase` bound to the build's configured base (`import.meta.env.BASE_URL`). */
export function withBase(path: string): string {
  const base =
    typeof import.meta.env !== 'undefined' ? (import.meta.env.BASE_URL ?? '/') : '/';
  return joinBase(base, path);
}
