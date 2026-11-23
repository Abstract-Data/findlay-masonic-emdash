# Findlay Masonic Temple

The website of the Masonic bodies that meet at the Findlay Masonic Temple in Findlay, Ohio, replacing findlaymason.org. Each body (Findlay Lodge No. 227, Chapter No. 58, Council No. 50, Commandery No. 49, the Order of the Eastern Star No. 23 and the Temple Board) keeps its own page, officers, news and calendar, edited by its own officers in the [EmDash](https://github.com/emdash-cms/emdash) admin. Admins also build and send the quarterly newsletter.

It runs on Cloudflare Workers with D1 and R2, built with Astro 7 and EmDash. The visual design is still being chosen (plan M4); the pages use the EmDash starter's neutral styles until then.

## Pages

| Page                         | Route                                |
| ---------------------------- | ------------------------------------ |
| Home                         | `/`                                  |
| Bodies                       | `/bodies`                            |
| A body                       | `/bodies/:slug`                      |
| A body's news                | `/bodies/:slug/news`                 |
| A news item                  | `/bodies/:slug/news/:news`           |
| A body's calendar            | `/bodies/:slug/calendar`             |
| A body's calendar feed (ICS) | `/bodies/:slug/calendar.ics`         |
| All news                     | `/news`                              |
| Temple calendar              | `/calendar`                          |
| Temple calendar feed (ICS)   | `/calendar.ics`                      |
| Newsletter archive           | `/newsletters`, `/newsletters/:slug` |
| About, Scholarships, Contact | `/pages/:slug`                       |

Every page is rendered on the server and ships no JavaScript of its own; the contact and newsletter forms are plain form posts protected by Cloudflare Turnstile.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` runs Astro through [portless](https://github.com/vercel-labs/portless), which serves the site at `https://findlay-masonic.localhost` (in a git worktree, `https://<branch>.findlay-masonic.localhost`; `pnpm exec portless get findlay-masonic` prints it). The first run starts a local HTTPS proxy and may ask for `sudo` to trust its certificate. Open `/_emdash/admin` on that URL and complete the setup wizard; EmDash runs the database migrations and applies `seed/seed.json`.

Checks, as CI runs them: `pnpm astro check`, `pnpm lint`, `pnpm format:check`, `pnpm vitest run`, `pnpm astro build`, `node tests/build/check-dist.mjs` and `pnpm e2e`. `AGENTS.md` describes each, and `docs/` holds the specification, plan and decisions.

## Deploying

Deploys are run by a human, never by an agent. `wrangler.jsonc` has a local-only top level and two environments, `staging` and `production`, each with its own Worker, D1, R2 and KV.

```bash
pnpm wrangler login
pnpm run deploy:staging      # CLOUDFLARE_ENV=staging astro build && wrangler deploy
pnpm run deploy:production
```

The Cloudflare adapter picks the environment at build time from `CLOUDFLARE_ENV` and writes a flattened config to `dist/server/wrangler.json`. `wrangler deploy --env staging` after a plain `astro build` silently deploys the local top-level bindings, so always deploy through these scripts.
