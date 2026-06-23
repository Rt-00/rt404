import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { publishedSorted } from '../lib/collection';
import { withBase } from '../lib/url';

export async function GET(context: APIContext) {
  const all = await getCollection('writeups');
  const writeups = publishedSorted(all, false);

  return rss({
    title: 'rt404',
    description: 'Writeups de CTF — TryHackMe, Hack The Box, HackingClub e mais.',
    site: context.site ?? 'https://example.github.io',
    items: writeups.map((w) => ({
      title: w.data.title,
      pubDate: w.data.date,
      description: w.data.description ?? w.data.category ?? '',
      categories: [w.data.platform, ...w.data.tags],
      link: withBase(`/writeups/${w.id}`),
    })),
  });
}
