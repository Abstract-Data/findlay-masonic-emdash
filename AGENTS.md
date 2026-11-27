This is the Findlay Masonic platform: an EmDash CMS site on Astro 7 and Cloudflare Workers that replaces findlaymason.org. Six Masonic bodies each maintain their own page, calendar and news, and an admin builds the newsletter.

The public pages follow design direction C, "Noticeboard" (`docs/design/direction-c/`): calendar first, Atkinson Hyperlegible Next, one ink brand colour and six body identity colours. A restyle belongs in `src/styles/theme.css` and the components in `src/components/`, not in the page data flow.

## Where decisions live

| Document                                                                                                                   | What it holds                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`docs/spec/findlay-masonic-platform/project-constitution.md`](docs/spec/findlay-masonic-platform/project-constitution.md) | Non-negotiable constraints and the Definition of Done. Read it first.    |
| [`docs/spec/findlay-masonic-platform/spec.md`](docs/spec/findlay-masonic-platform/spec.md)                                 | Requirements (FR/NFR numbers cited in tasks and tests)                   |
| [`docs/adr/ADR-001-stack-selection.md`](docs/adr/ADR-001-stack-selection.md)                                               | Stack decision                                                           |
| [`docs/plans/0001-findlay-masonic-platform/PLAN.md`](docs/plans/0001-findlay-masonic-platform/PLAN.md)                     | Milestones M0 to M8                                                      |
| [`docs/plans/0001-findlay-masonic-platform/TASK.md`](docs/plans/0001-findlay-masonic-platform/TASK.md)                     | Task checkboxes for the current milestones; tick only when Verify passes |
| [`docs/plans/0001-findlay-masonic-platform/STATUS.md`](docs/plans/0001-findlay-masonic-platform/STATUS.md)                 | Milestone state, open human actions, log                                 |
| [`docs/spec/findlay-masonic-platform/context7-receipts.md`](docs/spec/findlay-masonic-platform/context7-receipts.md)       | Library version receipts (append-only)                                   |

## Commands

pnpm only. Never `npm install`, `bun install` or another package manager.

```bash
pnpm install --frozen-lockfile   # install from the committed lockfile
pnpm dev                         # astro dev through portless at https://findlay-masonic.localhost
pnpm exec portless get findlay-masonic   # print the dev URL (a git worktree adds a branch label)
pnpm astro check                 # type-check .astro and .ts (0 errors required)
pnpm lint                        # oxlint (type-aware) + ESLint's two Astro rules
pnpm format                      # oxfmt for JS/TS/JSON/YAML/MD, Prettier for *.astro
pnpm format:check                # the same, check only
pnpm test                        # vitest run (tests/unit); add --coverage for a report in coverage/
pnpm e2e                         # Playwright; starts pnpm dev itself. CI: pnpm e2e --trace off
pnpm astro build                 # production build into dist/
node tests/build/check-cache-headers.mjs   # after a build: cache headers per route class, under wrangler dev
pnpm e2e --grep @monitor         # the post-deploy checks (tests/e2e/monitor/deployed.config.ts runs them against a site)
pnpm wrangler d1 execute DB --local --command "select 1"   # local D1 only
pnpm wrangler types              # regenerate worker-configuration.d.ts after editing wrangler.jsonc
```

The admin UI is at `/_emdash/admin` on the dev URL. Never document or hardcode a numeric localhost port.

Under a coding agent, Astro 7 runs `astro dev` in the background (`pnpm astro dev status`, `pnpm astro dev stop`). Playwright starts its own foreground server with `--ignore-lock`.

## Agent scope

| Access   | Paths and commands                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reads    | `src/`, `plugins/`, `seed/`, `tests/`, `docs/`, `astro.config.mjs`, `wrangler.jsonc`, `reference/` (read-only)                                                              |
| Writes   | `src/`, `plugins/`, `tests/`, `docs/`                                                                                                                                       |
| Executes | `pnpm`, `astro dev`/`check`/`build`, `vitest`, `playwright` (local), `oxlint`, `oxfmt`, `wrangler d1 execute --local`                                                       |
| Ask      | `wrangler deploy`, any `--remote` D1 command, Cloudflare account changes, live Resend broadcasts or sends to non-allowlisted addresses, secret values, editing `reference/` |

### PATH_ASK

Changes to `seed/seed.json` collection schemas or to `astro.config.*` need human confirmation. Propose the change in a PR, list it under "Open human actions" in STATUS.md, and let the human approve it by landing the PR. Never merge a PATH_ASK change yourself.

Deploys are human-only, through `pnpm run deploy:staging` or `pnpm run deploy:production`. The Cloudflare adapter picks the Wrangler environment at build time from `CLOUDFLARE_ENV`; `wrangler deploy --env staging` after a plain build deploys the local top-level bindings.

## Rules

### TypeScript and modules

- `tsconfig.json` extends `astro/tsconfigs/strict` with `noUncheckedIndexedAccess`. Keep `pnpm astro check` at 0 errors.
- Extensionless imports. Use the aliases `@core/*` (`src/lib/core`), `@adapters/*` (`src/lib/adapters`) and `@plugins/*` (`src/plugins`), never NodeNext `.js` suffixes.
- Pure domain logic (acl, recurrence, newsletter, ics) lives in `src/lib/core` with no I/O. Adapters (EmDash repo, Resend, clock) live in `src/lib/adapters`. Plugin hooks and routes stay thin callers.
- Runtime code uses Web-standard and Workers APIs only. Read bindings with `import { env } from "cloudflare:workers"`; `Astro.locals.runtime` was removed in Astro 6 and throws.
- Read configuration through `astro:env` (`astro:env/server`, `astro:env/client`). The schema is in `astro.config.mjs`; `.dev.vars.example` lists the names. Never commit a value, and never declare a field both `secret` and `client`.

### Astro and EmDash

- All content pages are server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Never use `set:html` or an inline `<script>` without `src`; ESLint fails on both. Render rich text with EmDash's Portable Text components. Put client code in `src/scripts/*.ts` and load it with `<script src>`.
- Hydrate only interactive widgets, with `client:visible` or `client:idle`. No `client:load` page islands.
- Astro 7 strips whitespace with JSX rules (`compressHTML: 'jsx'`). A line break between two inline elements renders as nothing; write `{" "}` where a space matters.
- `src/fetch.ts` is a reserved file name in Astro 7 (advanced routing).
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- When Astro's cache is enabled, pass content-query hints to `Astro.cache.set(cacheHint)`. Use the `WithCacheHint` variants for site settings, menus, taxonomies and widget areas rendered by cached routes.
- Taxonomy names in queries must match the seed's `"name"` field exactly.
- `src/live.config.ts` is EmDash loader boilerplate. Don't modify it.

### Public pages

- Public pages read content only through EmDash's query functions (`getEmDashCollection`, `getEmDashEntry`), via the loaders in `src/lib/adapters/site/content.ts`. Never read `Astro.locals.emdash.db` on a public page: EmDash gives anonymous visitors a reduced `locals.emdash` with no `db`, so the page is empty for them while it works for a signed-in Admin.
- Loaders parse entries into views (`src/lib/adapters/site/views.ts`); schedules, officer terms, month grids and paging are pure functions in `src/lib/core`. Links come from `paths` in `src/lib/adapters/site/paths.ts`.
- `bodies.contact_recipients` never reaches a page: views carry only `acceptsMessages`. The contact form posts to the newsletter plugin's `contact` route, which sends through EmDash's email pipeline (`email:deliver`).
- Each route registers its content hints with `cacheRoute`, which also sets how long the edge may keep the page: an hour by default, `clockBound(now)` for pages that show what comes next or what is on today (meetings, upcoming events, "Today", "Tonight"), which is fifteen minutes and never past local midnight in America/New_York, and `UNTAGGED` for pages whose data carries no cache tags. A route that calls nothing is never cached. `src/middleware.ts` takes any response for a signed-in user, or that sets a cookie, back out of the cache; never cache per-visitor output another way.
- Log through `log()` in `src/lib/adapters/log.ts`, adding an event type for a new event; never `console.log` a request body, an email address or a secret.

### Visual character (direction C)

- Tokens and the shared pieces (`.card`, `.body-label`, `.field`, `.input`, `.chip`, `.eyebrow`) live in `src/styles/theme.css`; component layout lives in each component's scoped style. Don't edit `tokens.css`; Base.astro holds the layout's own styles.
- One brand colour, the navy ink `--color-brand`, for buttons, links and focus rings. Never add a second accent.
- Body identity colours (FR-4.4) appear only as a bar, a swatch, a 12% tint or a date tile, and always beside the body's name. Put `data-colour={body.colour}` on the body's element; theme.css turns it into `--body-colour`. A new colour needs a light and dark value in theme.css, an entry in `BODY_COLOURS` (`src/lib/core/bodies/colour.ts`) and the seed's `colour` options (PATH_ASK), and `tests/unit/styles/contrast.test.ts` must stay green.
- Sentence-case labels in the body face; no mono capitals. Buttons and form fields are at least 44px tall.
- The font is committed (`src/assets/fonts/`) and loaded by the local provider in `astro.config.mjs`.

### Tests

- Unit tests: Vitest 5 through Astro's `getViteConfig()`, in `tests/unit/**/*.test.ts`. The Cloudflare adapter is skipped under Vitest, so unit tests cover the pure core, not Workers bindings. Fake timers also mock `Temporal`.
- End-to-end: Playwright in `tests/e2e`. The `setup` project signs each role in through EmDash's dev-only bypass and writes its `storageState` to `tests/e2e/.auth/` (git-ignored); the accounts and their body grants are in `tests/e2e/roles.ts`. The per-role body-access suites are in `tests/e2e/body-access/`, the public pages in `tests/e2e/public/` (seeded as Admin, visited as an anonymous visitor) axe in `tests/e2e/a11y/` and the read-only post-deploy checks in `tests/e2e/monitor/` (tag `@monitor`; `tests/e2e/monitor/deployed.config.ts` runs them against a deployed site). Tag smoke tests `@smoke`.
- The `visual` project (`tests/e2e/visual/`) runs last: it seeds a busy week, scans it with axe and screenshots home, a body page and the calendar at 1280 and 390 px in both schemes. `VISUAL_OUT=docs/design/direction-c/built pnpm e2e --project visual` refreshes the committed set.
- Lighthouse runs against a production build under `wrangler dev`: `CHROME_PATH=<chromium> node tests/perf/lighthouse.mjs <base URL> [runs per page]`.
- Assert what a user or caller can observe, not internals.

## Key files

| File                        | Purpose                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `astro.config.mjs`          | Astro config: adapter, `emdash()` with D1 and R2, `astro:env` schema (PATH_ASK) |
| `wrangler.jsonc`            | Local top level plus `env.staging` and `env.production` (separate D1, R2, KV)   |
| `seed/seed.json`            | Schema definition and demo content (PATH_ASK; reworked in M1)                   |
| `src/worker.ts`             | Worker entry: EmDash handler, Durable Objects, scheduled handler                |
| `src/layouts/Base.astro`    | Base layout with EmDash wiring (menus, search, page contributions)              |
| `emdash-env.d.ts`           | Generated collection types (regenerated on dev server start)                    |
| `worker-configuration.d.ts` | Generated binding types (`pnpm wrangler types`)                                 |
| `.github/workflows/ci.yml`  | CI: install, astro check, lint, format:check, vitest, build, e2e                |

## EmDash reference

Agent skills are in `.agents/skills/`. Load them for specific tasks:

- **building-emdash-site**: querying content, Portable Text, schema design, seed files, menus, widgets, search, SEO, bylines. Start here.
- **creating-plugins**: native plugins with hooks, storage, admin UI, API routes and Portable Text block types (`body-access` and `newsletter` are native, never sandboxed).
- **emdash-cli**: content management, seeding, type generation.

The EmDash docs MCP server (`https://docs.emdashcms.com/mcp`, configured in `.mcp.json`) is blocked from cloud sessions. There, read `node_modules/emdash` (README, types, dist) and the skills instead.
