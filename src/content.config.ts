import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { writeupSchema } from './lib/schema';

/**
 * The "writeups" collection: one markdown file per article under
 * src/content/writeups/<platform>/<slug>.md.
 *
 * Publishing a new article = add a markdown file with valid frontmatter.
 */
const writeups = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writeups' }),
  schema: writeupSchema,
});

export const collections = { writeups };
