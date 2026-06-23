// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import remarkRedactFlag from './src/lib/remark-redact-flag.mjs';

// GitHub Pages config.
// - User/org page  (usuario.github.io):  SITE_URL=https://usuario.github.io  BASE_PATH=/
// - Project page   (usuario/repo):       SITE_URL=https://usuario.github.io  BASE_PATH=/repo
// Override at build time via env vars (the deploy workflow sets these).
const SITE = process.env.SITE_URL || 'https://example.github.io';
const BASE = process.env.BASE_PATH || '/';

// https://astro.build/config
export default defineConfig({
  site: SITE,
  base: BASE,

  integrations: [react(), sitemap()],

  markdown: {
    // Redact flags from the body before highlighting so the real value
    // never reaches the HTML.
    remarkPlugins: [remarkRedactFlag],
    shikiConfig: {
      theme: 'github-dark',
      wrap: false,
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
