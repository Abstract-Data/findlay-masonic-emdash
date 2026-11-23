# STATUS — 0001-findlay-masonic-platform
| Field | Value |
|---|---|
| SDD phase | 3 — TASKS |
| State | **M0 verified; M1 agent tasks done, schema awaiting PATH_ASK approval and the M1 critic** |
| Last updated | 2026-11-23 |
| Current milestone | M1 — Content model and seed (T1.4–T1.6, T1.8 PATH_ASK; T1.2 lodge; T1.12 critic pending) |
| Tasks | [TASK.md](TASK.md) |
| ADR | [ADR-001](../../adr/ADR-001-stack-selection.md) — Accepted |

## Milestones
| ID | Milestone | State | Exit check |
|---|---|---|---|
| M0 | Foundation and toolchain | In progress: T0.1–T0.9, T0.13–T0.15 done (CI green, run 45241090879); T0.10, T0.11 built, awaiting PATH_ASK approval; T0.12, T0.16 human; T0.17 critic pending | CI green + staging deploy |
| M1 | Content model and seed | In progress: T1.1, T1.3, T1.7, T1.9–T1.11 done; T1.4–T1.6, T1.8 built, awaiting PATH_ASK approval; T1.2 lodge; T1.12 critic pending | Collections in admin, FR-9.2 test |
| M2 | Pure core | Not started | Vitest green, 100% branch on acl/recurrence |
| M3 | Auth + body-access | Not started | FR-5 per-role e2e green |
| M4 | Public site | Not started | FR-1/2/3/4/9.1 e2e, axe AA, Lighthouse ≥ 90 |
| M5 | Newsletter plugin | Not started | Staging send to allowlist + test Segment |
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

## Log
- 2026-11-23: Spec brainstorm Phases 0–5 complete (docs/spec/findlay-masonic-platform/). Planning decisions recorded (PLAN §2). Plan drafted.
- 2026-11-23: Plan approved by human. ADR promoted to docs/adr/ADR-001-stack-selection.md (Accepted). Constitution amendment 1 records the PLAN-phase NFRs and staging/production environments. M0 and M1 broken into TASK.md.
- 2026-11-23: M0 agent work for T0.1–T0.11 and T0.13–T0.15 pushed on `claude/happy-bell-oj5yoo`. oxlint/oxfmt pinned one release back because of pnpm's release-age cooldown (receipts log). Astro 7 verified with no blocker. T0.12 and T0.16 wait on a human; T0.17 waits on the critic.
- 2026-11-23: M0 independently verified at e218b68. M0 follow-ups: ESLint ignores coverage and Playwright output; CI runs a Node matrix (22.23.4, the real floor astro 7.4 declares, and latest 22; constitution amendment 3); `tests/unit/wrangler-envs.test.ts` keeps staging and production resources apart; Playwright reads the portless name from `package.json`; T8.0 carries the production resources. Constitution amendment 2 replaces `locals.runtime.env`.
- 2026-11-23: M1 agent work pushed on `claude/happy-bell-oj5yoo`: officer titles drafted, four collections and six bodies seeded (PATH_ASK), blog removed, types regenerated, seed and admin tests green. Design principles gates recorded for M0 and M1.
