# STATUS — 0001-findlay-masonic-platform
| Field | Value |
|---|---|
| SDD phase | 3 — TASKS |
| State | **M0 verified; M1 verified, schema awaiting PATH_ASK approval; M2 verified at 695c44f; M3 agent tasks and red-team fixes done, config awaiting PATH_ASK approval and the M3 critic; M5 agent tasks done ahead of M4, config awaiting PATH_ASK approval, staging send human; M4 functional half done ahead of its design gate, restyle and Lighthouse wait on the operator's design choice** |
| Last updated | 2026-11-23 |
| Current milestone | M3 — Auth + body-access (T3.12, T3.13 PATH_ASK; T3.17 human; T3.18 critic); M5 — Newsletter (T5.13 PATH_ASK; T5.16–T5.18 human; T5.19 critic); M4 — Public site (T4.1 operator design choice; T4.12–T4.14 wait on it); M1 PATH_ASK items, T1.2 and T2.17 still open |
| Tasks | [TASK.md](TASK.md) |
| ADR | [ADR-001](../../adr/ADR-001-stack-selection.md) — Accepted; [ADR-002](../../adr/ADR-002-body-access-middleware.md) — Proposed (lands with the M3 PR); [ADR-003](../../adr/ADR-003-newsletter-plugin.md) — Proposed (lands with the M5 PR) |

## Milestones
| ID | Milestone | State | Exit check |
|---|---|---|---|
| M0 | Foundation and toolchain | In progress: T0.1–T0.9, T0.13–T0.15 done (CI green, run 45241090879); T0.10, T0.11 built, awaiting PATH_ASK approval; T0.12, T0.16 human; T0.17 critic pending | CI green + staging deploy |
| M1 | Content model and seed | In progress: T1.1, T1.3, T1.7, T1.9–T1.11 done; T1.4–T1.6, T1.8 built, awaiting PATH_ASK approval; T1.2 lodge; T1.12 critic pending | Collections in admin, FR-9.2 test |
| M2 | Pure core | In progress: T2.1–T2.16 done (1107 unit tests green, 100% statements, branches, functions and lines on acl and recurrence); T2.17 critic pending | Vitest green, 100% branch on acl/recurrence |
| M3 | Auth + body-access | In progress: T3.1–T3.11, T3.14–T3.16 and red-team fixes T3.19–T3.30 done (48 e2e green locally; 100% on acl and recurrence); T3.12, T3.13 built, awaiting PATH_ASK approval; T3.17 human; T3.18 critic pending | FR-5 per-role e2e green |
| M4 | Public site | In progress, functional half done ahead of the design gate: T4.2–T4.11 done (91 e2e green on a fresh database, 34 of them M4's; 2738 unit tests; axe 0 violations on 17 routes in light and dark and on both plugin pages); T4.1 design direction with the operator; T4.12 restyle and T4.13 Lighthouse (carried to M7) wait on it; T4.14 critic pending | FR-1/2/3/4/9.1 e2e, axe AA, Lighthouse ≥ 90 |
| M5 | Newsletter plugin | In progress, ahead of M4: T5.1–T5.12, T5.14, T5.15, T5.20 and fix round T5.21–T5.25 done (57 e2e green on a fresh database, 48 of them M3's; 2645 unit tests; production bundle checked for the SDK, keys, dev fakes and inlined runtime settings); T5.13 and T5.22 built, awaiting PATH_ASK approval; T5.16–T5.18 human; T5.19 critic pending | Staging send to allowlist + test Segment |
| M6 | Content migration | Not started | Inventory resolved, redirects green |
| M7 | Observability + hardening | Not started | Code-devil clean, Checkly 48 h green |
| M8 | Launch | Not started | Production live, lodge sign-off |

## Astro 7 verification (T0.15)
Outcome: **no blocker. Stay on Astro 7.** No Astro 6 fallback needed.

Sources: the Astro docs source at `raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/` (`guides/upgrade-to/v7.mdx`, `guides/integrations-guide/cloudflare.mdx`, `guides/environment-variables.mdx`, `guides/testing.mdx`, `reference/cli-reference.mdx`, `reference/configuration-reference.mdx`), fetched 2026-11-23 because docs.astro.build and astro.build are blocked by the cloud session's proxy. Plus the installed packages (astro 7.4.13, @astrojs/cloudflare 14.4.9) and running this repo.

| Rule (overlay / constitution) | Result | Evidence |
|---|---|---|
| Vite 8 / Rolldown bundling | OK | `pnpm astro build` completes on vite 8.3.8 (Rolldown chunking output); no Vite-specific config beyond `css.lightningcss`. |
| Rust compiler (only compiler in v7) | OK | Template compiles; `astro check` 0 errors. v7 rejects unclosed tags and no longer repairs invalid nesting, so new templates must be valid HTML. |
| Whitespace: `compressHTML` default is now `'jsx'` | Changed | A line break between inline elements renders as nothing; use `{" "}`. Checked after Prettier reformatted every `.astro` file: rendered text of 10 pages (home, posts, 3 posts, search, about, category, tag, 404) is identical to the pre-format build. Rule added to AGENTS.md. |
| `src/fetch.ts` reserved (advanced routing is default) | Changed | New in v7. Never name a module `src/fetch.ts`. Noted in AGENTS.md. |
| Bindings via `locals.runtime.env` (constitution § Platform and stack) | Changed | Removed since Astro 6; adapter 14 throws (`cf-helpers.js`). Use `import { env } from "cloudflare:workers"`, `Astro.request.cf`, global `caches`, `Astro.locals.cfContext`. The constitution line is stale; AGENTS.md has the current rule. |
| `astro:env` server secrets / no secret+client | OK | Schema in `astro.config.mjs` type-checks; Astro rejects `context: "client"` + `access: "secret"` by design. On Cloudflare, `astro:env/server` reads Worker vars and secrets. |
| Cloudflare adapter 14: sessions on KV `SESSION` | OK, with a deploy caveat | Adapter injects `SESSION` unless `wrangler.jsonc` declares it. Each env now declares its own. See Workers Builds note below. |
| Cloudflare adapter 14: Wrangler environments | Changed | The env is chosen at build time with `CLOUDFLARE_ENV`; the build writes a flattened `dist/server/wrangler.json`. `wrangler deploy --env staging` after a plain build silently uses the local bindings (verified with `--dry-run`). Deploy scripts `deploy:staging` / `deploy:production` set `CLOUDFLARE_ENV`. |
| Vitest through `getViteConfig()` | OK, with a workaround | Works with Vitest 5.1.1. The adapter's workerd runner cannot start under Vitest (`depsOptimizer is required in dev mode`), so `astro.config.mjs` drops the adapter when `VITEST` is set. Unit tests target the pure core only, as PLAN already assumes. |
| `astro dev` under an agent | Changed | v7 backgrounds `astro dev` when it detects an AI agent (macOS/Linux). Playwright uses `--ignore-lock` to keep a foreground server it can stop. |
| `astro check` replaces bare `tsc` | OK | `@astrojs/check` 0.9.12 against strict tsconfig: 0 errors. |

## Design principles gates (M0 + M1)
Gate text: [docs/gates/astro-design-principles.md](../../gates/astro-design-principles.md), restated from the constitution and AGENTS.md because the original A1–A12 text was never committed. Run 2026-11-23 over every `*.astro`, route, config and `src/lib/**` file touched since a80c248 (M0 and M1).

| Rule | Result | Evidence |
|---|---|---|
| A1 server-rendered | Pass | `output: "server"`; no `getStaticPaths` or `prerender` in `src/`. |
| A2 no blanket `client:load` | Pass | No `client:` directive in `src/`. |
| A3 no `set:html` | Pass | `pnpm lint` clean (`astro/no-set-html-directive`). |
| A4 no unsafe inline scripts | Pass | Only `<script src>` and `is:inline src`; lint clean. |
| A5 server-only SDKs stay on the server | Pass (vacuous) | No server SDK or D1 access in client code; React is the EmDash admin only. |
| A6 `astro:env`, no secret+client | Pass | 10 fields; `TURNSTILE_SITE_KEY` is the only client field and is public; `.dev.vars.example` has names only. |
| A7 `cloudflare:workers` env | Pass | No `locals.runtime` in `src/`; `src/worker.ts` reads no bindings directly. |
| A8 Web/Workers APIs only at runtime | Pass | `process.env` only in `astro.config.mjs` (build time) and `playwright.config.ts`; `node:` imports only in tests and configs. |
| A9 cache hints | Pass after fix | M1 moved `index.astro` and `pages/[slug].astro` from `getSiteSettings()` to `getSiteSettingsWithCacheHint()`. Astro's cache is not enabled yet. |
| A10 images and ids | Pass | No image field rendered in touched pages; `pages/[slug]` routes by `entry.id`. |
| A11 valid templates, `{" "}` | Pass | `astro check` 0 errors; `astro build` Complete. |
| A12 no numeric ports | Pass | Only the vendored EmDash skill references under `.agents/skills/` mention `localhost:4321`. |
| T1 strict | Pass | `astro check` 0 errors. |
| T2 no `any`/unsafe casts | Pass | `src/lib/core/acl/officer-titles.ts` has none; oxlint `no-unsafe-type-assertion` clean repo-wide. |
| T3 pure core | Pass | `officer-titles.ts` is an `as const` table with no imports. |
| T4 adapters as the boundary | n/a | No adapters until M2. |
| T5 branded ids | n/a | No ids in `src/lib` until M2. |
| T6 illegal states unrepresentable | Pass | `BodyType` is derived from the table's keys; the generated `body_type` type equals it (`emdash-types.test.ts`). |
| T7 pure, exhaustive acl policy | n/a | Policy arrives in M2. |
| T8 extensionless alias imports | Pass | Tests import `@core/acl/officer-titles`; no `.js` suffixes. |

## TypeScript Design Principles Gate (M2)
Gate text: [docs/gates/astro-design-principles.md](../../gates/astro-design-principles.md). Run 2026-11-23 over `src/lib/**` (every file is new in M2 except `officer-titles.ts`). The Astro gate is n/a for M2: no `.astro` or route file changed; the config changes are lint and test settings.

| Rule | Result | Evidence |
|---|---|---|
| T1 strict | Pass | `pnpm astro check` 0 errors. |
| T2 no `any`/unsafe casts | Pass, with documented brand mints | No `any`, `@ts-ignore` or `@ts-expect-error` in `src/lib`. oxlint `no-unsafe-type-assertion` is clean. Seven assertions mint core-owned brands where no runtime check could fail, each with a disable comment giving the reason: `time.ts` (ISO weekday and month ranges), `recurrence/rrule.ts` (the validated `RRule` and its weekday code), `newsletter/key.ts` (`Revision` counter and `BroadcastKey`). Adapter brands are minted by validating type predicates, without assertions. |
| T3 pure core | Pass | `src/lib/core` imports only sibling modules, `temporal-polyfill`, `rrule-temporal`, `ical-generator` and `timezones-ical-library`; oxlint `no-restricted-imports` enforces it. No clock reads: `now` is a parameter everywhere. |
| T4 adapters as the boundary | Pass | `src/lib/adapters/emdash/parse.ts` takes `unknown` entry data and returns `Result` with the failing field; core never sees raw EmDash data. |
| T5 branded ids | Pass | `BodyId`, `UserId`, `EntryId`, `IssueId`, `TagSlug`, `AbsoluteUrl`, `RRule`, `Revision`, `BroadcastKey`; tests mint them only in `tests/unit/fixtures.ts`. |
| T6 illegal states unrepresentable | Pass | Discriminated unions for `Principal`, `Operation`, `Decision`, `EventTiming`, `IssueWindow`, `Issue` (a state machine with fail-closed transitions) and the TipTap node tuples; `RRule` carries its parsed parts so nothing re-parses. |
| T7 pure, exhaustive acl policy | Pass | `authorize` is pure; 864 exhaustive cases plus the decision table; 100% branch coverage on `src/lib/core/acl` is a Vitest threshold. |
| T8 extensionless alias imports | Pass | No `.js` suffixes. Core uses relative imports within itself; adapters and tests use `@core` and `@adapters`. |

## Design principles gates (M3)
Run 2026-11-23 over every file M3 touched. Astro gate: `src/middleware.ts`, `astro.config.mjs`, `tsconfig.json`, `playwright.config.ts` and the CI workflow. TypeScript gate: `src/lib/**` and `src/plugins/body-access/**`.

| Rule | Result | Evidence |
|---|---|---|
| A1 server-rendered | Pass | No page added; `output: "server"` unchanged. |
| A2 no blanket `client:load` | Pass | No `client:` directive; the plugin's React runs inside EmDash's admin, not as a page island. |
| A3 no `set:html` | Pass | `pnpm lint` clean. |
| A4 no unsafe inline scripts | Pass | `pnpm lint` clean. |
| A5 server-only SDKs stay on the server | Pass | `src/plugins/body-access/admin.tsx` imports only `react`; the hooks, routes and grant storage are server modules it never imports. |
| A6 `astro:env`, no secret+client | Pass | `MICROSOFT_TENANT_ID` is `server`/`public`; `.dev.vars.example` lists the name only. |
| A7 `cloudflare:workers` env | Pass | The middleware reads `locals.user` and `locals.emdash`; no `locals.runtime`. |
| A8 Web/Workers APIs only at runtime | Pass, one recorded use | `src/lib/adapters/emdash/actor-context.ts` imports `AsyncLocalStorage` from `node:async_hooks`, which Workers provides under the `nodejs_compat` flag already in `wrangler.jsonc` (EmDash uses it for its own request context). Proven in the production build under `wrangler dev`. `node:url` appears only in `astro.config.mjs` (build time). |
| A9 cache hints | n/a | No cached route touched. |
| A10 images and ids | n/a | No template touched. |
| A11 valid templates | Pass | `pnpm astro check` 0 errors; `pnpm astro build` Complete. |
| A12 no numeric ports | Pass | No new doc or config names a port; the runbook uses the site address. |
| T1 strict | Pass | `pnpm astro check` 0 errors. |
| T2 no `any`/unsafe casts | Pass, one documented assertion | No `any`, `@ts-ignore` or `@ts-expect-error`. `admin.tsx` asserts the `data` of an EmDash plugin-route answer to the type its caller expects, with a disable comment giving the reason. |
| T3 pure core | Pass | `policy.ts` and `rrule.ts` gained no imports; `no-restricted-imports` clean. |
| T4 adapters as the boundary | Pass | `entries.ts`, `grants.ts`, `parse.ts` and `request-guard.ts` parse EmDash entries, revisions, media, users and grant rows before `authorize` sees them; the hooks and the middleware hold no policy. |
| T5 branded ids | Pass | `UserId` and `BodyId` come only from `parseUserId` and `parseBodyId`; grant rows that name no valid body grant nothing. |
| T6 illegal states unrepresentable | Pass | `Operation`, `DenyReason`, `RouteRule` and `Scope` are discriminated unions; `ROUTE_TABLE` and `COLLECTION_SCOPES` are tables, with fail-closed defaults. |
| T7 pure, exhaustive acl policy | Pass | 30 operations, 2160 exhaustive cases after the red-team fixes; acl at 100% branch coverage; hooks and middleware only call `authorize`. |
| T8 extensionless alias imports | Pass | `@core`, `@adapters` and `@plugins` (now `src/plugins`); no `.js` suffixes. |

## Design principles gates (M5)
Run 2026-11-23 over every file M5 touched. Astro gate: `src/pages/newsletters/*`, `src/components/NewsletterSignup.astro`, `astro.config.mjs`, `playwright.config.ts` and the CI workflow. TypeScript gate: `src/lib/**` and `src/plugins/newsletter/**`.

| Rule | Result | Evidence |
|---|---|---|
| A1 server-rendered | Pass | The archive pages render on the server; no `getStaticPaths` or `prerender`. |
| A2 no blanket `client:load` | Pass | No `client:` directive; the signup form is a plain form post and loads only Turnstile's own script. |
| A3 no `set:html` | Pass | The sent email is shown in a sandboxed `iframe srcdoc`; `pnpm lint` clean. |
| A4 no unsafe inline scripts | Pass | Turnstile's `<script is:inline src>` has no body; `pnpm lint` clean. |
| A5 server-only SDKs stay on the server | Pass | Lint bans `resend` outside `resend-mailer.ts` and the mailer outside the plugin's server modules (11 oxlint and 2 ESLint probe errors); `tests/build/check-dist.mjs` finds no SDK or key in `dist/client`. `admin.tsx` imports `./service` for types only. |
| A6 `astro:env`, no secret+client | Pass | New fields `RESEND_FROM` and `RESEND_FAKE` (server, public, boolean); `TURNSTILE_SITE_KEY` stays the only client field. Fix round: the four settings set as Worker variables are `server`/`secret` so they are read at runtime (`tests/build/check-runtime-env.mjs`). |
| A7 `cloudflare:workers` env | Pass | No `locals.runtime`. Fix round: the archive reads through the plugin's public routes with `getPublicPluginApiRouteHandler`, because an anonymous page's `locals.emdash` has no `db`. |
| A8 Web/Workers APIs only at runtime | Pass | `fetch`, `URLSearchParams`, `AbortSignal.timeout`, `crypto.randomUUID`; `node:` only in tests and `tests/build/check-dist.mjs`. |
| A9 cache hints | n/a | Astro's cache is not enabled; the archive is not cached yet (M7). |
| A10 images and ids | Pass | Article images are made absolute from the image field's `src`; body checkboxes use `entry.data.id`. |
| A11 valid templates | Pass | `pnpm astro check` 0 errors; `pnpm astro build` Complete. |
| A12 no numeric ports | Pass | The runbook and tests use the site address and paths only. |
| T1 strict | Pass | `pnpm astro check` 0 errors. |
| T2 no `any`/unsafe casts | Pass, two documented assertions | No `any`, `@ts-ignore` or `@ts-expect-error`. `routes.ts` asserts a fresh `crypto.randomUUID()` is an `IssueId`; `admin.tsx` asserts route data and the stored document are what the page sent, as Body Access does. Stored-issue brands are minted by type predicates. |
| T3 pure core | Pass | `events.ts` and `email-html.ts` import only siblings and `temporal-polyfill`; the core import ban now also covers `@adapters/*`, `@plugins/*` and the mailer. |
| T4 adapters as the boundary | Pass | `issues.ts` parses stored rows and TipTap JSON, `content.ts` parses EmDash items, routes validate input with zod, the mailer maps SDK errors to `rejected` or `unavailable`. |
| T5 branded ids | Pass | `IssueId` (UUID), `Revision` and `BroadcastKey` are minted by predicates in `issues.ts`. |
| T6 illegal states unrepresentable | Pass | The core `Issue` union drives every transition through `step`; `NewsletterErrorCode` maps to HTTP status in one table; `ProviderChoice` is a union. |
| T7 pure, exhaustive acl policy | n/a | No acl change. |
| T8 extensionless alias imports | Pass | `@core`, `@adapters`, `@plugins`; no `.js` suffixes. |

## Design principles gates (M4)
Run 2026-11-23 over every file M4 touched. Astro gate: the new pages under `src/pages/` (`index.astro`, `bodies/**`, `news/**`, `calendar.astro`, `calendar.ics.ts`, `pages/[slug].astro`), the components in `src/components/`, `src/layouts/Base.astro` and `playwright.config.ts`. TypeScript gate: `src/lib/core/{calendar,bodies,news}`, `src/lib/core/recurrence/meetings.ts`, `src/lib/core/time.ts`, `src/lib/adapters/site/**`, `src/lib/adapters/emdash/{parse,route-table}.ts`, `src/lib/adapters/newsletter/content.ts` and `src/plugins/newsletter/{contact,routes,index}.ts`. Each grep check is the one the gate file lists; lint, `astro check` and the build cover the rest.

| Rule | Result | Evidence |
|---|---|---|
| A1 server-rendered | Pass | No `getStaticPaths` or `prerender` in `src/`. |
| A2 no blanket `client:load` | Pass | No `client:` directive in `src/`. The pages add no script; the contact form is a plain form post. |
| A3 no `set:html` | Pass | `pnpm lint` clean; rich text renders through EmDash `PortableText`. |
| A4 no unsafe inline scripts | Pass | No `<script>` without `src` in `src/components` or `src/pages`; Turnstile's `is:inline src` moved unchanged into `Turnstile.astro`. |
| A5 server-only SDKs stay on the server | Pass | No `resend`, `cloudflare:workers` or `locals.emdash` in the M4 components, pages or `src/lib/adapters/site`; the contact route runs in the plugin. `check-dist.mjs` passes all 14 checks. |
| A6 `astro:env`, no secret+client | Pass | No new field. `TURNSTILE_SITE_KEY` moves from `client`/`public` (built in) to `server`/`secret` (read at runtime), so no field is `client` any more; `check-runtime-env.mjs` proves it is not in the bundle. |
| A7 `cloudflare:workers` env | Pass | No `locals.runtime`; public pages never read `locals.emdash` (visitors get it without `db`). |
| A8 Web/Workers APIs only at runtime | Pass | New runtime code uses Web APIs only (`crypto.subtle`, `TextEncoder`, `URL`); the only `node:` import outside tests is M3's recorded `node:async_hooks`. |
| A9 cache hints | Pass | Every M4 route passes its content hints to `cacheRoute` (a no-op until a provider is configured); home, bodies, body, calendars add `CLOCK_BOUND` (15 minutes) because they show what comes next. Site settings and menus use the `WithCacheHint` variants. |
| A10 images and ids | Pass | Emblems, officer photos and featured images render through `<Image>` from `emdash/ui`; no raw `<img>`. URLs use slugs (`paths`); the contact form and queries use body ULIDs (`entry.data.id`). |
| A11 valid templates | Pass | `pnpm astro check` 0 errors; `pnpm astro build` Complete. |
| A12 no numeric ports | Pass | No new doc or config names a port; `tests/perf/p95.mjs` takes the base URL as an argument. |
| T1 strict | Pass | `pnpm astro check` 0 errors. |
| T2 no `any`/unsafe casts | Pass, one documented assertion | No `any`, `@ts-ignore` or `@ts-expect-error`. `time.ts` adds `isoMonth`, the month counterpart of the existing `isoWeekday` assertion, with its reason. |
| T3 pure core | Pass | The new core modules import only siblings, `temporal-polyfill` and `officer-titles`; `no-restricted-imports` clean; `now` and `today` are parameters. |
| T4 adapters as the boundary | Pass | `views.ts` parses EmDash entries before core sees them; `contact.ts` validates form fields with zod and reads its KV counter defensively. |
| T5 branded ids | Pass | Views carry `BodyId` and `EntryId` from `parseBodyId`/`parseEntryId`; tags are `TagSlug`. |
| T6 illegal states unrepresentable | Pass | `ContactOutcome` and `BodySchedule` are unions; `SHORT_NAME` is a `Record<BodyType, string>`, so a new body type fails to compile until it has a label. |
| T7 pure, exhaustive acl policy | n/a | No acl change. |
| T8 extensionless alias imports | Pass | `@core`, `@adapters`, `@plugins`; no `.js` suffixes. |

## Local P95 server time (M4)
A local indicator, not the NFR: `node tests/perf/p95.mjs https://m4run.localhost 50` on the dev server (Vite and workerd, local SQLite for D1, no route cache) with the e2e suites' data, 50 requests per route after 3 warm-up requests. Server time is EmDash's `Server-Timing: mw`; wall time adds portless and the loopback. What bounds it: 3 to 9 queries per page (`db.count`), 8 to 32 ms of database time. Production adds D1's network round trip per query, which this setup cannot show, and the route cache this setup lacks. The budget (P95 < 300 ms on cached pages, via Axiom) and Lighthouse are M7's.

| Route | Server P50 ms | Server P95 ms | Wall P50 ms | Wall P95 ms |
|---|---|---|---|---|
| `/` | 58 | 70 | 86 | 104 |
| `/bodies` | 51 | 64 | 79 | 101 |
| `/bodies/commandery` | 48 | 66 | 75 | 109 |
| `/bodies/eastern-star/news` | 40 | 56 | 65 | 82 |
| `/news` | 44 | 63 | 68 | 92 |
| `/calendar?month=2026-11` | 48 | 58 | 75 | 97 |
| `/bodies/eastern-star/calendar?month=2026-11` | 40 | 51 | 65 | 82 |
| `/calendar.ics` | 29 | 42 | 52 | 69 |
| `/bodies/eastern-star/calendar.ics` | 23 | 28 | 45 | 54 |
| `/pages/about` | 25 | 38 | 50 | 65 |
| `/newsletters` | 30 | 37 | 55 | 66 |

## Workers Builds `SESSION` KV failure
The PR's Workers Builds deploy fails with `binding SESSION of type kv_namespace must have a namespace_id specified`. Cause, read from wrangler 4.166 (`provisionBindings` in `wrangler-dist/cli.js`): the adapter adds a `SESSION` binding with no ID, and wrangler's auto-provisioning would create the namespace, but when listing KV namespaces returns a permission error it skips provisioning silently and uploads the binding without an ID. So the Workers Builds API token most likely lacks KV permission (inferred, not seen in the build log). No config-only fix exists that keeps EmDash sign-in working: EmDash stores users in the Astro session, and a different session driver needs other infrastructure. Two human fixes, either works: create the KV namespaces and paste their IDs (T0.12), or grant the Workers Builds token KV edit permission so provisioning runs. Workers Builds should also deploy with `CLOUDFLARE_ENV=staging` (see above); the top level is now local-only with IDs `local` and will not deploy.

## Open human actions
- **T0.10 (PATH_ASK):** approve the `astro:env` schema in `astro.config.mjs` by landing the PR.
- **T0.11 (PATH_ASK):** approve the `wrangler.jsonc` split by landing the PR. Decide whether the existing D1 `findlay-masonic-site` (`e973aaf5-…`) becomes production or is retired; it is no longer bound in any env. Confirm Worker names (`findlay-masonic-emdash-staging`, `findlay-masonic-emdash-production`) and R2 bucket names.
- **astro.config.mjs (PATH_ASK, from T0.7 and T0.8):** two more edits ride on the same PR. The adapter is skipped under Vitest, and dev passes `PORTLESS_URL` to EmDash `siteUrl`.
- **T0.12:** create staging D1, R2 (`findlay-masonic-media-staging`), KV and the Axiom destinations `axiom-staging-logs` / `axiom-staging-traces`; paste the IDs. This also fixes the Workers Builds check, or grant its token KV permission.
- **Workers Builds:** set its build to `CLOUDFLARE_ENV=staging` (or production) before `wrangler deploy`.
- **T0.16:** staging deploy with `pnpm run deploy:staging` (not `wrangler deploy --env staging`; see the Astro 7 table).
- **T1.2:** lodge confirms officer titles (start early; it gates T1.5).
- **T1.4, T1.5, T1.6, T1.8 (PATH_ASK):** approve the M1 `seed/seed.json` schema and seed by landing the PR. Officer title options come from the DRAFT lists; T1.2 still has to confirm them. Body full names ("Findlay Lodge", "Findlay Chapter, Order of the Eastern Star" and so on) are placeholders the lodge should confirm.
- **Built-in Categories and Tags:** every EmDash database starts with `category` and `tag` taxonomy definitions (migration 006), bound to the removed `posts`. A seed cannot delete them. On each environment, an admin removes them once with `DELETE /_emdash/api/taxonomies/category` and `/tag` (or from the admin).
- **Body numbers:** Council No. 50 and Order of the Eastern Star No. 23 come only from `docs/spec/findlay-masonic-platform/brainstorm-intake.md:7` (the intake's description of the live findlaymason.org). `reference/` is the 2023 staging export and does not corroborate them. Pending lodge confirmation.
- **T3.12 (PATH_ASK):** approve the M3 `astro.config.mjs` changes by landing the PR: the native `body-access` plugin descriptor, `authProviders: [google(), microsoft()]`, the `MICROSOFT_TENANT_ID` env field, and `vite.optimizeDeps.include` for `@cloudflare/kumo` (the providers' sign-in buttons import it from source; without it CI run 45260287484 failed).
- **T3.13 (PATH_ASK):** approve `"widget": "body-access:body"` on the three `body` fields in `seed/seed.json`. A database seeded before M3 keeps the plain ID box until an Admin sets the widget on each `body` field (`PUT /_emdash/api/schema/collections/<collection>/fields/body` with `{ "widget": "body-access:body" }`, then check the field is still required and indexed).
- **Media default (decision O1, reversible):** uploads need at least one body grant; changing, replacing or deleting a media item needs its uploader or an Admin. To let any granted editor change any file, change the `media-item` rules in `src/lib/adapters/emdash/route-table.ts`.
- **Static pages are site-wide:** body editors can edit `pages` (Home, About, Scholarships, Contact), like menus and widgets (ADR-002 residual risk 2). To make them Admin-only, drop `pages` from `COLLECTION_SCOPES` in `src/lib/adapters/emdash/entries.ts`.
- **T3.17 (HUMAN), sign-in on staging (FR-8.2):** create the Google and Microsoft OAuth clients (callback `<site>/_emdash/api/auth/oauth/<provider>/callback`), store `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET` and `MICROSOFT_TENANT_ID` as Worker secrets and vars, keep EmDash's allowed domains empty, then follow `docs/runbooks/onboard-body-editor.md` with a passkey and with each provider. The e2e suites sign in through the dev-only bypass and cannot cover this.
- **Production `siteUrl`:** passkeys bind to the site's origin, which EmDash takes from `siteUrl`; today it is set only in dev (from portless). Decide the staging and production `siteUrl` before T3.17.
- **Residual-risk sign-off (M8, Q14):** ADR-002 lists nine accepted residual risks, the constitution's two included, for the lodge to accept. Risks 7 to 9 came from the M3 red team: translation groups if i18n is ever enabled, refusals of a write addressed by a slug another body shares, and id-shaped slugs an Admin can still store.
- **T5.13 (PATH_ASK):** approve the M5 `astro.config.mjs` changes by landing the PR: the `newsletter` native plugin descriptor (entrypoint and admin entry), and two env fields, `RESEND_FROM` (the sender on the verified domain) and `RESEND_FAKE` (server, public, boolean, default false: dev server only, ignored by builds).
- **T5.22 (PATH_ASK, M5 fix round):** in the same `astro.config.mjs`, `RESEND_FROM`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID` and `NEWSLETTER_TEST_ALLOWLIST` change from `context: "server", access: "public"` to `access: "secret"`. They are not secrets; `secret` is how `astro:env` reads a value from the Worker env at runtime instead of inlining it at build time, which would have left the Worker variables the runbook sets unread. `TURNSTILE_SITE_KEY` gains a comment that each environment's build needs its key. `wrangler.jsonc` gains empty `vars` for the four in `env.staging` and `env.production`.
- **T5.16 (HUMAN), Resend and Turnstile keys and objects:** from 1Password, set `RESEND_API_KEY` and `TURNSTILE_SECRET` as Worker secrets per environment. Fill `RESEND_FROM`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID` and `NEWSLETTER_TEST_ALLOWLIST` in that environment's `vars` in `wrangler.jsonc` (a deploy overwrites dashboard values). Fill `TURNSTILE_SITE_KEY` in the same `vars`: since M4 it is read at runtime too (T4.15). In Resend, verify the sending domain and create the `subscribers` Segment, a staging-only test Segment holding allowlisted addresses only, the newsletter Topic and one Topic per body with default "opt out"; save each body Topic's id in that body's **Resend topic id** field and publish the body. Create the Turnstile widget for the site's hostnames. The runbook's first table lists each one.
- **T5.17 (HUMAN), staging send test:** on staging, follow `docs/runbooks/newsletter-send.md` end to end with `RESEND_SEGMENT_ID` set to the staging-only Segment: a test reaches the allowlist inbox, the approved Broadcast is received with a working unsubscribe link, an EmDash invite arrives by email (FR-8.1, and **Settings → Email** shows the newsletter plugin as provider), and a signup appears in Resend with its Topics. Two things only a real Resend can answer: whether `Idempotency-Key` is honoured on `POST /broadcasts` (the key-named lookup does not depend on it), and what adding an existing contact to its Segment returns.
- **T5.18 (HUMAN), Checkly heartbeat:** create a Checkly `HeartbeatMonitor` for scheduled sends and wire it to the staging send (PLAN M5).
- **Newsletter decisions (reversible):** compose in the admin page, not on the server (ADR-003: a headless editor needs `@tiptap/core` as a direct dependency, which moves EmDash admin's TipTap peers); article links go to the news item's own page, `/bodies/<slug>/news/<news slug>` (R8, added in M4); a section whose event list the Admin deleted gets none back at approval; the public form never clears a contact's global unsubscribe; the email theme in `src/plugins/newsletter/theme.ts` is a placeholder for the M4 design.
- **T4.15 (PATH_ASK, M4):** in `astro.config.mjs`, `TURNSTILE_SITE_KEY` changes from `context: "client", access: "public"` to `context: "server", access: "secret"`, as T5.22 did for the newsletter settings: not a secret, but read from the Worker env at runtime, because only server-rendered forms use it. `wrangler.jsonc` declares it empty in `env.staging.vars` and `env.production.vars`; `worker-configuration.d.ts` is regenerated. One build now serves every environment, and the runbook no longer asks for the key at deploy time.
- **T4.1 (OPERATOR), design direction:** choose A (Framed Lodge), B (Temple) or C (Noticeboard). The restyle (T4.12) then touches `src/styles/theme.css` and `src/components/`; B and C also change the `astro.config.mjs` fonts and C adds a colour field to `bodies` (both PATH_ASK), and A needs FR-4.4 amended to "labelled by body". Calendar entries already carry `data-body` and a text label for the colour coding. Lighthouse ≥ 90 (T4.13) follows the restyle, in M7.
- **Contact recipients (spec Q12):** an Admin fills each body's **Contact form recipients** and publishes the body. Until then the body's page says its form is not set up and the Contact page leaves the body out. Delivery needs the email transport (T5.16).
- **FR-9.1 pages (M6):** the seed holds only About. Editors create `home` (its copy becomes the home page's intro), `scholarships` and `contact` (the Contact page shows the form for every body) in the pages collection; M6 migrates their copy. The primary menu has no Contact or Scholarships item; add them in the admin or the seed (PATH_ASK).
- **M4 decisions (reversible):** (1) A body's current officer term is the latest term year it has entered that has begun: next year's officers wait for January, and a body whose term began last autumn keeps it, shown as "Officers for <year>". For an explicit term, add a `current_term` field to bodies (PATH_ASK). (2) The contact route lives in the newsletter plugin, which already owns Resend, Turnstile and the public signup, so `astro.config.mjs` is unchanged; one email goes to the first recipient with the rest in cc; the limit is five per sender and body an hour. (3) `/news/<slug>`, the news collection's `urlPattern` (admin "view" links, previews), answers 302 to the item's page under its body, keeping the query. (4) A timed event is listed on the day it starts; an all-day event on each of its days. (5) A body page's upcoming events include its stated meetings, as FR-1.1 reads. (6) Pages that show what comes next expire from the route cache after 15 minutes (`CLOCK_BOUND`).

## Log
- 2026-11-23: Spec brainstorm Phases 0–5 complete (docs/spec/findlay-masonic-platform/). Planning decisions recorded (PLAN §2). Plan drafted.
- 2026-11-23: Plan approved by human. ADR promoted to docs/adr/ADR-001-stack-selection.md (Accepted). Constitution amendment 1 records the PLAN-phase NFRs and staging/production environments. M0 and M1 broken into TASK.md.
- 2026-11-23: M0 agent work for T0.1–T0.11 and T0.13–T0.15 pushed on `claude/happy-bell-oj5yoo`. oxlint/oxfmt pinned one release back because of pnpm's release-age cooldown (receipts log). Astro 7 verified with no blocker. T0.12 and T0.16 wait on a human; T0.17 waits on the critic.
- 2026-11-23: M0 independently verified at e218b68. M0 follow-ups: ESLint ignores coverage and Playwright output; CI runs a Node matrix (22.23.4, the real floor astro 7.4 declares, and latest 22; constitution amendment 3); `tests/unit/wrangler-envs.test.ts` keeps staging and production resources apart; Playwright reads the portless name from `package.json`; T8.0 carries the production resources. Constitution amendment 2 replaces `locals.runtime.env`.
- 2026-11-23: M1 agent work pushed on `claude/happy-bell-oj5yoo`: officer titles drafted, four collections and six bodies seeded (PATH_ASK), blog removed, types regenerated, seed and admin tests green. Design principles gates recorded for M0 and M1.
- 2026-11-23: M2 agent work (T2.1–T2.16) on `claude/happy-bell-oj5yoo`: pure acl, recurrence, ics and newsletter core with an EmDash parse adapter; 1107 unit tests, 100% coverage gate on acl and recurrence, core import restrictions in oxlint, TypeScript gate pass. Follow-ups from the M1 verification: exact pin of each officer title list and a fixture for the seed `$ref` check. T2.17 waits on the critic.
- 2026-11-23: M2 passed independent verification at 695c44f. Its follow-ups land in M3: ICS calendar-name escaping (T3.3), one principal record per user (T3.5) and plain-text RRULE errors on save (T3.2).
- 2026-11-23: M3 agent work (T3.1–T3.16) on `claude/happy-bell-oj5yoo`: core policy extended (restore, unschedule, discard, stored live and draft bodies, media, admin-only); the native `body-access` plugin with hooks, grant routes, the Body Access page and the body field; `src/middleware.ts` guarding every write no hook sees, failing closed, and refusing MCP below Admin; structural tests for capabilities and EmDash's route list; per-role Playwright suites in CI; ADR-002 and the onboarding runbook. CI run 45260287484 failed on the admin smoke test after the OAuth providers made the admin load `@cloudflare/kumo` unbundled; pre-bundling it fixed it (run 45266276314). T3.12 and T3.13 wait on PATH_ASK approval, T3.17 on a human, T3.18 on the critic.
- 2026-11-23: M3 red-team fixes (T3.19–T3.30) on `claude/happy-bell-oj5yoo`, from two reviews of feb8594. Each `entry` rule now names its EmDash handler's lookup, and the middleware authorizes every entry an `[id]` could name, with drafts read strictly; editors cannot save id-shaped slugs; unpublish is guarded with the draft's body; only an Admin trashes, unpublishes or schedules a body's page; guard read failures refuse; hooks act for the request's user when the event names none; translations stay in their source's body. ADR-002 corrected (Editors can mint their own bearer tokens; not a bypass) and gains residual risks 7 to 9. Each finding's test failed before its fix. Evidence: 48 e2e green with `CI=true` on a fresh database and on a rerun; 2550 unit tests, acl and recurrence at 100%; the red team's four probes re-run against the fixed server return 403 or 422 where they returned 201 or 200. Probe by probe, served from feb8594 then from the fix: the recovery revision through an id slug 201 then 403, through a shared slug in another locale 201 then 403; unpublish of a moved draft 200 then 403; an Editor's entry in a `constructor` collection 201 then 422; an Editor's unpublish and trash of their own body's page 200 and 200 then 403 and 403. CI run 45280131313 green on both legs at fb98499 (48 e2e each).
- 2026-11-23: M5 agent work (T5.1–T5.12, T5.14, T5.15) on a local branch from `claude/happy-bell-oj5yoo`, ahead of M4's design gate: `resend` 6.39.0 added; core event refresh (R13), footer and archive transforms; Resend mailer, Turnstile, clock and dev-only fakes; the native `newsletter` plugin (issue routes, idempotent approval with a compare-and-set hold and key-named Broadcast lookup, public signup, `email:deliver`), the Newsletter admin page with the email editor, the archive and signup form; lint and a build check keep Resend and the fakes where they belong. ADR-003 and the send runbook. T5.13 waits on PATH_ASK approval, T5.16–T5.18 on a human, T5.19 on the critic.
- 2026-11-23: M5 rebased onto the M3 red-team fixes (813667e) and pushed on `claude/happy-bell-oj5yoo`. Every newsletter and body-access plugin route is now classified by its guard in `route-table.ts` (T5.20). On a clean copy: 2639 unit tests and 55 e2e (48 from M3, 7 from M5) green.
- 2026-11-23: M5 fix round (T5.21–T5.25) on `claude/happy-bell-oj5yoo`, after an independent verifier failed 6d49955. B1: anonymous visitors saw an empty archive and 404 issue pages because EmDash gives an anonymous page no database handle; the archive now reads through two public read-only plugin routes via EmDash's public dispatcher. N1: the four newsletter settings set as Worker variables were inlined by the build; they are now read at runtime and declared as `vars` per environment (PATH_ASK `astro.config.mjs`). N2: a globally unsubscribed address is never re-subscribed, and the form says so. N4: checked on the production build under `wrangler dev`; the email transport registers with the Worker's secrets, no change. N5, N6: check-dist scans source maps; a stale path fixed. On a clean copy and a fresh database: 2645 unit tests and 57 e2e green.
- 2026-11-23: M4 functional half (T4.2–T4.11) on a local branch from `claude/happy-bell-oj5yoo`, ahead of the design gate: pure rules for month grids, agendas, meetings, officer terms, labels and paging; a site adapter that reads only through EmDash's public query functions; every public route in FR-1 to FR-4 and FR-9.1 plus the news detail page (R8) and ICS feeds; the per-body contact form through `email:deliver` (Q12); dead blog CSS and wording removed. On a clean copy with a fresh database: 2738 unit tests, 91 e2e with `CI=true` (15 public as a visitor, 19 axe), `astro check` 0 errors, lint and format clean, build and the 14 dist checks pass; local P95 server time 28 to 70 ms per route on the dev server. T4.1 waits on the operator; T4.12 to T4.14 on T4.1.
