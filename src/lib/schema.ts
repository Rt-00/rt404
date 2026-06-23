import { z } from 'zod';
import { PLATFORM_IDS } from './platforms';

/** Difficulty levels accepted in frontmatter. */
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'insane'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * Frontmatter schema for a writeup article.
 *
 * Kept free of `astro:content` imports so it can be unit-tested directly and
 * reused by the Astro content collection (see src/content.config.ts).
 */
export const writeupSchema = z.object({
  /** Article title. */
  title: z.string().min(1),
  /** CTF platform id; validated against the platform registry. */
  platform: z.enum(PLATFORM_IDS),
  /** Publication date; drives chronological grouping and ordering. */
  date: z.coerce.date(),
  /** Challenge difficulty. */
  difficulty: z.enum(DIFFICULTIES),
  /** Free-text category, e.g. "Web Exploitation". */
  category: z.string().optional(),
  /** Short summary used on cards and meta description. */
  description: z.string().optional(),
  /** Tags for filtering. */
  tags: z.array(z.string()).default([]),
  /** Captured flag, if any. */
  flag: z.string().optional(),
  /** Target host/IP, if relevant. */
  target: z.string().optional(),
  /** When true, the article is excluded from production builds. */
  draft: z.boolean().default(false),
});

export type WriteupData = z.infer<typeof writeupSchema>;
