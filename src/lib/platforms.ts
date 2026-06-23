/**
 * Registry of supported CTF platforms.
 *
 * Single source of truth: the content schema validates `platform` against
 * these ids, and the UI uses `name`/`color` for badges and grouping.
 * To support a new platform, add one entry here.
 */
export interface Platform {
  /** Slug used in frontmatter and URLs (lowercase, no spaces). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Accent color (hex) used by badges/headers. */
  color: string;
  /** Official website, shown as a link where relevant. */
  url?: string;
}

export const PLATFORMS = [
  {
    id: 'tryhackme',
    name: 'TryHackMe',
    color: '#c11111',
    url: 'https://tryhackme.com',
  },
  {
    id: 'hackthebox',
    name: 'Hack The Box',
    color: '#9fef00',
    url: 'https://www.hackthebox.com',
  },
  {
    id: 'hackingclub',
    name: 'HackingClub',
    color: '#22d3ee',
    url: 'https://hackingclub.com',
  },
  {
    id: 'vulnlab',
    name: 'VulnLab',
    color: '#f59e0b',
    url: 'https://www.vulnlab.com',
  },
  {
    id: 'portswigger',
    name: 'PortSwigger',
    color: '#ff6633',
    url: 'https://portswigger.net/web-security',
  },
  {
    id: 'picoctf',
    name: 'picoCTF',
    color: '#a855f7',
    url: 'https://picoctf.org',
  },
  {
    id: 'rootme',
    name: 'Root-Me',
    color: '#e11d48',
    url: 'https://www.root-me.org',
  },
  {
    id: 'other',
    name: 'Other',
    color: '#94a3b8',
  },
] as const satisfies readonly Platform[];

/** Union of valid platform ids, e.g. 'tryhackme' | 'hackthebox' | ... */
export type PlatformId = (typeof PLATFORMS)[number]['id'];

/** Non-empty tuple of ids, for building a Zod enum. */
export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as [PlatformId, ...PlatformId[]];

const PLATFORM_BY_ID = new Map<string, Platform>(PLATFORMS.map((p) => [p.id, p]));

/** Look up a platform by id, or `undefined` if unknown. */
export function getPlatform(id: string): Platform | undefined {
  return PLATFORM_BY_ID.get(id);
}

/** Display name for an id, falling back to the id itself if unknown. */
export function platformName(id: string): string {
  return PLATFORM_BY_ID.get(id)?.name ?? id;
}

/** Accent color for an id, falling back to the neutral "other" color. */
export function platformColor(id: string): string {
  return PLATFORM_BY_ID.get(id)?.color ?? '#94a3b8';
}
