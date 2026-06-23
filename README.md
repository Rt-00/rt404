# rt404

Blog estático de **writeups de CTF** com estética de terminal Linux / cybersegurança.
Construído com **Astro + Tailwind CSS v4 + shadcn/ui**. Os artigos são markdown com
frontmatter, agrupados por **plataforma** (TryHackMe, Hack The Box, HackingClub…) e por
**mês/ano**.

## Requisitos

- Node.js >= 22

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:4321 (hot-reload)
```

Outros scripts:

| Script              | O que faz                      |
| ------------------- | ------------------------------ |
| `npm run build`     | Build estático em `dist/`      |
| `npm run preview`   | Servir o build localmente      |
| `npm run typecheck` | `astro check` (tipos)          |
| `npm run lint`      | ESLint                         |
| `npm run format`    | Prettier (escrita)             |
| `npm test`          | Testes unitários (Vitest)      |
| `npm run test:e2e`  | Testes end-to-end (Playwright) |

> Os drafts (`draft: true`) aparecem em `npm run dev`, mas são **excluídos** do build de produção.

## Publicando um writeup

1. Crie um arquivo markdown em `src/content/writeups/<plataforma>/<slug>.md`.
2. Adicione o frontmatter:

```yaml
---
title: 'NØVA CTF Challenge'
platform: hackingclub # tem que existir em src/lib/platforms.ts
date: 2026-06-20 # usado para ordenar e agrupar por mês/ano
difficulty: medium # easy | medium | hard | insane
category: 'Web Exploitation' # opcional
description: 'Resumo curto.' # opcional (cards e meta)
tags: [vite, websocket] # opcional
flag: 'hackingclub{...}' # opcional
target: '172.16.13.57:5173' # opcional
draft: false # opcional (default false)
---
```

3. Escreva o conteúdo em markdown (blocos de código ganham syntax highlighting automático).
4. Commit + push. O GitHub Actions faz build e deploy.

> O schema (`src/lib/schema.ts`) valida o frontmatter no build — uma `platform`
> desconhecida ou `date` ausente **falha o build**. Para adicionar uma plataforma nova,
> inclua uma entrada em `src/lib/platforms.ts`.

## Deploy (GitHub Pages)

O workflow `.github/workflows/deploy.yml` publica a cada push na `main`.

Configuração única no GitHub:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. O `site` e o `base` são detectados automaticamente pelo `actions/configure-pages`
   (funciona tanto para `usuario.github.io` quanto para `usuario/repo`).

Para rodar o build de produção localmente apontando para um caminho específico:

```bash
SITE_URL=https://usuario.github.io BASE_PATH=/rt404 npm run build
```

## Estrutura

```
src/
  content/writeups/<plataforma>/<slug>.md   # artigos
  content.config.ts                          # collection + schema
  lib/        platforms, schema, group, collection, format, url (puros/testáveis)
  components/ TerminalWindow, Prompt, ArticleCard, PlatformBadge, ui/ (shadcn)
  layouts/    BaseLayout, ArticleLayout
  pages/      index, writeups/[...slug], platform/, archive/, tags/, rss.xml, 404
tests/
  unit/  (Vitest)   e2e/ (Playwright)
```
