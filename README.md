# Findlay Masonic Temple

The website of the Masonic bodies that meet at the Findlay Masonic Temple in Findlay, Ohio, replacing findlaymason.org. Each body (Findlay Lodge No. 227, Chapter No. 58, Council No. 50, Commandery No. 49, the Order of the Eastern Star No. 23 and the Temple Board) keeps its own page, officers, news and calendar, edited by its own officers in the [EmDash](https://github.com/emdash-cms/emdash) admin. Admins also build and send the quarterly newsletter.

It runs on Cloudflare Workers with D1 and R2, built with Astro 7 and EmDash.

## Design

The site follows design direction C, "Noticeboard", chosen by the operator on 2026-11-24. The mockup, its notes and the reference screenshots are in [`docs/design/direction-c/`](docs/design/direction-c/), and screenshots of the built pages are in its `built/` folder.

- **Calendar first.** The home page opens on this week at the Temple, with a filter by body, links to the previous and next weeks, the month view and a calendar feed for phones. Each body's page opens on its next stated meeting.
- **Legible type.** Atkinson Hyperlegible Next, designed for low-vision readers, at 18px. Labels are in sentence case.
- **One ink, six body colours.** Buttons, links and focus rings use one navy ink. Each body has an identity colour, which appears only as a bar, a swatch, a light tint or a date tile, and always beside the body's name.

To change the look, edit `src/styles/theme.css` (tokens, the body colours in light and dark, and the few shared pieces) and the components in `src/components/`. `tests/unit/styles/contrast.test.ts` checks every colour pair there against WCAG AA. An editor picks a body's colour from the **Calendar colour** field on the body, out of six named colours; a body without one takes its type's default. The font file is committed in `src/assets/fonts/` under its SIL Open Font License. The newsletter's email theme is `src/plugins/newsletter/theme.ts`. The "Thinking of joining?" card on the home page writes to Findlay Lodge No. 227; `JOINING_BODY` in `src/pages/index.astro` names another body.

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
