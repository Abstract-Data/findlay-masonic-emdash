# TASK — 0001-findlay-masonic-platform (M0 to M3, M5)
**SDD phase:** 3 (TASKS)
**Plan:** [PLAN.md](PLAN.md) (approved 2026-11-23) · **Status:** [STATUS.md](STATUS.md)
**Scope:** M0 to M3, and M5 ahead of M4's design gate. Later milestones are tasked when their predecessor's exit check passes (PLAN §8).

## Conventions
- One checkbox = one reviewable commit (or a small, coherent group of commits). Tick it only when its **Verify** line passes.
- Owner tags: **[AGENT]** can be done in this repo by an agent. **[HUMAN]** needs a person (Cloudflare account, secrets, deploys, client input). **[PATH_ASK]** an agent drafts it, but a human must approve the PR before it merges (constitution § Data integrity and operations: `seed/seed.json` schemas and `astro.config.*`).
- `Deps:` lists tasks that must be ticked first. Tasks without deps in the same milestone can run in parallel.
- Every install uses `pnpm`. No `wrangler deploy` or `--remote` D1 command by an agent.
- A milestone is done when all its boxes are ticked, its exit check passes, and the task-critic subagent returns PASS (constitution § Definition of done).

---

## M0 — Foundation and toolchain

### Dependencies
- [x] **T0.1 [AGENT] Bump EmDash and create the lockfile.** `pnpm add emdash@1.6.0 @emdash-cms/cloudflare@1.6.0`; commit the first `pnpm-lock.yaml` (none exists today). Confirm `engines.node >= 22.16` in `package.json`.
  Verify: `pnpm install --frozen-lockfile` succeeds on a clean clone; `pnpm astro build` succeeds.
  Evidence: frozen install in a clean copy outside the repo; `astro build` Complete. emdash 1.6.0, astro 7.4.13; engines.node >=22.16.
- [x] **T0.2 [AGENT] Pin the newsletter editor.** `pnpm add -E @react-email/editor@1.8.10` (exact, no caret; receipt in `context7-receipts.md`). Not imported anywhere until M5.
  Deps: T0.1. Verify: `package.json` shows `"@react-email/editor": "1.8.10"`.
  Evidence: package.json has `"@react-email/editor": "1.8.10"`. Transitive @tiptap peer mismatch left for M5.

### TypeScript
- [x] **T0.3 [AGENT] Strict tsconfig.** Extend `astro/tsconfigs/strict` (house "tsconfig.json (Astro strict)" template). Fix the template code errors this surfaces in `src/` without changing behavior.
  Deps: T0.1. Verify: `pnpm astro check` reports 0 errors.
  Evidence: `pnpm astro check` Result (32 files): 0 errors, 0 warnings. No template changes were needed.
- [x] **T0.4 [AGENT] Path aliases.** Add `@core/*` → `src/lib/core/*`, `@adapters/*` → `src/lib/adapters/*`, `@plugins/*` → `plugins/*`; create the empty `src/lib/core/` and `src/lib/adapters/` folders (with `.gitkeep`). Extensionless imports only (constitution § Platform and stack).
  Deps: T0.3. Verify: a throwaway import via `@core/…` type-checks and builds; remove it.
  Evidence: a throwaway `@core/throwaway` import in 404.astro type-checked and landed in the build chunk; removed.

### Lint and format
- [x] **T0.5 [AGENT] Oxlint + Oxfmt.** Add `oxlint@1.95.0` and `oxfmt@0.80.0`; copy the house `oxlint.config.ts` and `.oxfmtrc.jsonc` (JS/TS Base, Stable 1.0.0). Scripts: `lint`, `format`, `format:check`. Format the repo in a separate commit.
  Deps: T0.1. Verify: `pnpm lint` and `pnpm format:check` are clean.
  Evidence: `pnpm lint` and `pnpm format:check` exit 0. Versions are oxlint 1.94.0 / oxfmt 0.79.0 (pnpm release-age cooldown; receipts log).
- [x] **T0.6 [AGENT] Astro leftovers.** Add `prettier` + `prettier-plugin-astro@1.1.2` with the house `.prettierrc (Astro)` scoped to `*.astro`/MDX; add `eslint` + `eslint-plugin-astro@3.2.1` with the two-rule `eslint.config.mjs (Astro)` (`no-set-html-directive`, `no-unsafe-inline-scripts`). Fold both into `lint` / `format:check`.
  Deps: T0.5. Verify: `pnpm lint` and `pnpm format:check` are clean; a temporary `set:html` in a page makes `pnpm lint` fail.
  Evidence: both scripts exit 0; a temporary `set:html` in 404.astro made `pnpm lint` exit 1 (`astro/no-set-html-directive`), then was removed.

### Tests
- [x] **T0.7 [AGENT] Vitest 5.** Add `vitest@5.1.1` and `@vitest/coverage-v8`; `vitest.config.ts` uses Astro's `getViteConfig()`; include `tests/unit/**/*.test.ts`; coverage reporter on `src/lib/**`. Script `test`. Add one sanity test.
  Deps: T0.4. Verify: `pnpm vitest run` is green; `pnpm vitest run --coverage` writes a report.
  Evidence: `pnpm vitest run` 3 tests passed; `--coverage` wrote coverage/index.html. Adapter skipped under VITEST (astro.config.mjs).
- [x] **T0.8 [AGENT] Portless dev.** Wrap `dev` with portless so the site runs at a named `.localhost` URL; remove any numeric-port references from `AGENTS.md`/`README.md` (constitution § Secrets and configuration).
  Deps: T0.1. Verify: `pnpm dev` serves the template at the named URL, and `/_emdash/admin` loads.
  Evidence: dev served https://<branch>.findlay-masonic.localhost: home 200, /_emdash/admin to /setup 200. No numeric port in AGENTS.md or README.md.
- [x] **T0.9 [AGENT] Playwright 1.65.** `@playwright/test@1.65.1`; `playwright.config.ts` with `webServer.url` (not `port`) pointing at the portless URL; a `setup` project that writes `tests/e2e/.auth/<role>.json` (git-ignored). For now it creates only `anon`; `admin`, `blue-lodge`, `chapter` and `unassigned-editor` are stubbed with `test.skip` and a pointer to M3. One `@smoke` test: home returns 200 and has an `<h1>`. Script `e2e`; CI passes `--trace off`.
  Deps: T0.8. Verify: `pnpm e2e --grep @smoke --trace off` is green locally.
  Evidence: `CI=true pnpm e2e --grep @smoke --trace off` in a clean copy: 2 passed, 4 skipped (role stubs), exit 0.

### Configuration
- [ ] **T0.10 [PATH_ASK] `astro:env` schema.** In `astro.config.mjs`, declare server secrets `RESEND_API_KEY`, `TURNSTILE_SECRET`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET` (`context: 'server', access: 'secret'`) and non-secret server values `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID`, `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `NEWSLETTER_TEST_ALLOWLIST`; `TURNSTILE_SITE_KEY` as `context: 'client', access: 'public'`. All `optional: true` until their milestone. Add `.dev.vars.example` with names only, no values.
  Deps: T0.3. Verify: `pnpm astro check` passes; no field is both `secret` and `client`; human approves the PR.
  Agent part done (unticked until the human approves): `astro check` 0 errors; 10 fields, none both secret and client.
- [ ] **T0.11 [PATH_ASK] Wrangler environments.** Restructure `wrangler.jsonc` from the house "wrangler.jsonc (Astro on Cloudflare)" template: top level = local dev; `env.staging` and `env.production`, each with its own `name`, D1 (`DB`), R2 (`MEDIA`), KV (`SESSION`), Durable Object binding, cron and an `observability` block (logs + traces, Axiom destinations by name). Resource IDs are placeholders `"<set by human: T0.12>"`. Decide with the human whether the existing D1 `findlay-masonic-site` (`e973aaf5-…`) becomes production or is retired; record the answer in the PR.
  Deps: T0.1. Verify: `pnpm wrangler deploy --dry-run --env staging` resolves config (placeholders aside); `pnpm wrangler types` regenerates `worker-configuration.d.ts` with the KV binding.
  Agent part done (unticked until the human approves): `CLOUDFLARE_ENV=staging pnpm astro build && pnpm wrangler deploy --dry-run` resolves staging bindings; `wrangler types` emits `SESSION: KVNamespace`. `--env staging` after a plain build resolves local bindings, so deploys use `deploy:staging`. Awaiting human approval and the D1 decision (STATUS.md).
- [ ] **T0.12 [HUMAN] Create staging resources.** In Cloudflare: staging D1, R2 bucket and KV namespace; Axiom dataset + OTLP destinations for staging logs and traces. Paste the IDs into `wrangler.jsonc` (IDs are not secrets).
  Deps: T0.11. Verify: `pnpm wrangler d1 list` shows the staging DB; IDs are committed.

### CI and agent docs
- [x] **T0.13 [AGENT] GitHub Actions CI.** `.github/workflows/ci.yml` from the house "GitHub Actions CI (Astro)" template: pnpm 11.9 + Node setup with cache (matrix: the engines floor 22.23.4 and latest 22) → `pnpm install --frozen-lockfile` → `astro check` → `lint` → `format:check` → `vitest run` → `astro build` → Playwright install + `e2e --grep @smoke --trace off`. No secrets required to pass.
  Deps: T0.6, T0.7, T0.9. Verify: the workflow is green on the M0 PR.
  Evidence: CI run 45241090879 on a74876e green: every step passed, smoke e2e 2 passed / 4 skipped at https://findlay-masonic.localhost. CI starts the portless proxy first (`portless run` will not sudo without a TTY).
- [x] **T0.14 [AGENT] Project `AGENTS.md`.** Rebuild from the JS/TS Base v1.3.0 + Astro overlay, keeping the EmDash sections that still apply. Add: the Phase 3 Agent Scope (reads/writes/executes/ASK list, `brainstorm-intake.md` line 69), the PATH_ASK rule, the plan/spec/ADR links, and the real commands (`pnpm dev`, `test`, `e2e`, `lint`, `format`, `astro check`). Drop the blog-template "This Template"/"Visual character" sections; note the design is pending the M4 gate.
  Deps: T0.8, T0.13. Verify: every command listed in `AGENTS.md` runs; no numeric localhost port appears.
  Evidence: every command in AGENTS.md was run in M0; no numeric localhost port.
- [x] **T0.15 [AGENT] Astro 7 verification.** Check the Astro overlay's rules against Astro 7.x (Vite 8/Rolldown, Rust compiler, `astro:env`, Cloudflare adapter 14, `getViteConfig`) by reading astro.build directly (Context7 has no v7 docs). Record each rule as OK / changed / blocker in STATUS.md. If there is a blocker, stop and propose the Astro 6 fallback to the human.
  Deps: T0.7, T0.9, T0.10. Verify: STATUS.md has the verification table and outcome.
  Evidence: STATUS.md table; no blocker, stay on Astro 7.

### M0 exit
- [ ] **T0.16 [HUMAN] Staging deploy.** `pnpm run deploy:staging` (runs `CLOUDFLARE_ENV=staging astro build && wrangler deploy`; `wrangler deploy --env staging` after a plain build deploys the local bindings), then confirm the template renders at the staging URL and `/_emdash/admin` loads.
  Deps: T0.12, T0.13. Verify: staging URL recorded in STATUS.md.
- [ ] **T0.17 [AGENT] Close M0.** Run the task-critic subagent over M0, update STATUS.md (M0 → Done, log entry).
  Deps: all of M0. Verify: critic returns PASS.

---

## M1 — Content model and seed

### Client input (start now, it gates T1.5)
- [x] **T1.1 [AGENT] Draft officer titles.** Write `docs/plans/0001-findlay-masonic-platform/officer-titles.md`: a standard title list in conventional order per body type — Blue Lodge, Royal Arch Chapter, Cryptic Council, Commandery (Knights Templar), Order of the Eastern Star, Temple Board — marked "DRAFT — awaiting lodge confirmation (Q9)".
  Verify: six lists present, each title with its display order.
  Evidence: `officer-titles.md` has six numbered lists (11, 13, 10, 12, 18, 5 titles), marked DRAFT. The same lists are `TITLES_BY_BODY_TYPE` in `src/lib/core/acl/officer-titles.ts`.
- [ ] **T1.2 [HUMAN] Lodge confirms officer titles.** The lodge corrects/approves `officer-titles.md`; record who approved and when at the top of the file.
  Deps: T1.1.

### Schema (one PATH_ASK PR)
- [x] **T1.3 [AGENT] Verify schema mechanics before writing it.** From `.agents/skills/building-emdash-site/references/schema-and-seed.md` and the EmDash docs (docs MCP is unreachable from cloud sessions; use the skill references or a local session), confirm and note in the PR: (a) how to make a `reference` field target a specific collection; (b) whether seed fields support an index flag, and if not, how a reference column gets indexed (EmDash default, migration, or plugin storage) — the constitution requires an indexed `body` reference; (c) `select`/`multiSelect` option syntax; (d) `repeater` sub-fields; (e) `$ref:` syntax for references in seed content. Field slugs must match `/^[a-z][a-z0-9_]*$/`, so the plan's camelCase names become snake_case (e.g. `contact_recipients`, `display_order`, `include_in_newsletter`).
  Verify: findings written in the PR description, each with its source.
  Evidence (EmDash 1.6.0, re-proved in M1; sources under `node_modules/emdash/src/`):
  (a) A `reference` field takes `"options": { "collection": "bodies" }`. `validation.targetCollection` would bind it, but a bound reference has no column, cannot be `indexed` (`seed/validate.ts`), cannot be filtered with `where`, and its value never reaches `content:beforeSave`. So `body` is unbound.
  (b) Seed fields take `"indexed": true`. Applying the seed to a scratch DB (`npx emdash seed seed/seed.json --database <tmp>.db`) creates a TEXT `body` column on `ec_officers`, `ec_events` and `ec_news`, each with `idx_cf_<id>` and `idx_cf_<id>_loc` partial indexes on `("body" IS NOT NULL), "body", id`.
  (c) `select`/`multiSelect`: `"validation": { "options": [..strings..] }`. The admin shows the raw string, so options are display strings.
  (d) `repeater`: `"validation": { "subFields": [{ slug, label, type, required? }] }`; rows are objects.
  (e) `"$ref:<seed id>"` resolves forward only, so `bodies` comes first in `content`. Probe seed with one officer and one event: `body` stored the bodies ULID, and naive `2026-11-10T19:30` stored as `2026-11-11T00:30:00.000Z` because `settings.timezone` is `America/New_York` (`site:timezone` row confirmed).
  `npx emdash seed seed/seed.json --validate`: "Seed file is valid". Field slugs are snake_case.
- [ ] **T1.4 [PATH_ASK] Add the four collections to `seed/seed.json`.**
  - `bodies`: `name` (string, req, searchable), `number` (integer), `emblem` (image), `description` (portableText), `contact_recipients` (repeater of email strings; **never rendered publicly** — note this in the field label), `schedule_note` (text), `tag_vocabulary` (repeater of `{ slug, label }`), `body_type` (select: blue_lodge, chapter, council, commandery, oes, temple_board), `resend_topic_id` (string), `display_order` (integer). Slug drives `/bodies/{slug}`.
  - `officers`: `body` (reference → bodies, req, indexed), `title` (select, values from T1.2), `name` (string, req), `photo` (image), `term_year` (integer, req), `display_order` (integer). Note: one select holds every body type's titles, so the per-body-type restriction (FR-2.1: title must be in the list for the body's `body_type`) is a save-time check added in M2/M3 — record this in the PR.
  - `events`: `body` (reference, req, indexed), `title` (string, req), `start` / `end` (datetime, req; America/New_York wall time), `all_day` (boolean), `rrule` (string), `exdates` (json, `string[]`), `location` (string), `description` (portableText), `is_stated_meeting` (boolean).
  - `news`: `body` (reference, req, indexed), `title` (string, req, searchable), `content` (portableText, req, searchable), `publish_date` (datetime, req), `featured_image` (image), `tags` (multiSelect — options validated against the body's `tag_vocabulary` by the M3 guard, not a global taxonomy), `include_in_newsletter` (boolean, default true).
  - `pages`: unchanged. Set `supports` per collection (drafts/revisions/preview everywhere; `search` on news and pages; `seo` on bodies, news, pages).
  Deps: T1.3. Verify: `npx emdash` seed validation (or `pnpm dev` on a fresh `data.db`) loads without errors; human approves the PR.
  Agent part done, awaiting human approval. Deviations from the bullets above, from the M1 findings: `body` is an unbound indexed reference labelled "Body (do not change field settings)"; `body_type` and officer `title` options are display strings ("Blue Lodge", "Worshipful Master"); `news.tags` is a repeater of `{ tag }` rows, not a multiSelect; `officers` and `events` are `routable: false` with `drafts`/`revisions` only. `include_in_newsletter` has `defaultValue: true`, which seed apply ignores. Seed validates and applies (T1.3 evidence).
- [ ] **T1.5 [PATH_ASK] Fill officer title options.** Replace the placeholder `title` select options with the confirmed lists from T1.2.
  Deps: T1.2, T1.4.

  Agent part done, awaiting human approval: options are the 51-title union of the DRAFT lists. Lodge confirmation (T1.2) is still open; when it lands, edit `TITLES_BY_BODY_TYPE` and the seed options together (`seed.test.ts` fails if they drift).
### Remove the blog template
- [ ] **T1.6 [PATH_ASK] Strip blog demo content from the seed.** Remove the `posts` collection and its entries, the `category`/`tag` taxonomies and terms, the demo bylines, sidebar widgets (`newsletter-signup`, `about-author`) and `commentsEnabled`. Set `meta` and `settings` (title "Findlay Masonic Temple", a real tagline — no stock copy). `primary` menu: Home, Bodies, Calendar, News, About (pages it points to may 404 until M4; note that in the PR).
  Deps: T1.4. Verify: fresh seed loads; admin shows no Posts, Categories or Tags.
  Agent part done, awaiting human approval. Posts, taxonomies, terms, bylines, sidebar widgets and sections are gone; settings are "Findlay Masonic Temple" with a real tagline and `timezone`. The admin still lists Categories and Tags: EmDash migration 006 inserts built-in `category`/`tag` definitions (bound to the non-existent `posts`) in every database, and a seed cannot delete them. Remove them per environment with `DELETE /_emdash/api/taxonomies/category` and `/tag` as an admin (STATUS.md open actions).
- [x] **T1.7 [AGENT] Remove blog routes and components.** Delete `src/pages/posts/`, `category/`, `tag/`, `rss.xml.ts`, `search.astro` (search returns in M4 if wanted), `PostCard.astro`, `Byline.astro`, `utils/reading-time.ts`; make `src/pages/index.astro` a minimal placeholder listing bodies by name (real design comes at the M4 gate). Keep `pages/[slug]`.
  Deps: T1.6. Verify: `pnpm astro check` and `pnpm astro build` pass; `@smoke` e2e still green.

  Evidence: posts, category, tag, rss, search, PostCard, Byline, Pagination, reading-time, search-snippet (and its test) and toc.ts deleted. Base.astro drops the RSS links and the `/search` icon link, and LiveSearch covers `news` and `pages`. The home page lists the six bodies in `display_order`; `/posts`, `/search` and `/rss.xml` return 404. `astro check` 0 errors, `astro build` Complete, `@smoke` e2e 3 passed.
### Seed content
- [ ] **T1.8 [PATH_ASK] Seed the six bodies.** Blue Lodge No. 227, Chapter No. 58, Council No. 50, Commandery No. 49, Order of the Eastern Star No. 23, Findlay Temple Board (no number), with `body_type`, `display_order` 1–6 and an empty `tag_vocabulary`. Numbering comes from the live findlaymason.org (FR-9.2), **not** the 2023 staging build (which shows "Council #58"; see `docs/site-inventory.md`). Cross-check each number against `reference/findlay-masonic/` (read-only) and cite where it was found in the PR.
  Deps: T1.4. Verify: T1.10 passes.
  Agent part done, awaiting human approval. Slugs `blue-lodge`, `chapter`, `council`, `commandery`, `eastern-star`, `temple-board`. Numbers: Lodge 227 and Commandery 49 appear in `reference/` (`docs/site-inventory.md` rows 188, 191); Chapter 58 matches the "#58" card that carries the Chapter emblem (row 96); Council 50 and OES 23 come only from `brainstorm-intake.md:7`, pending lodge confirmation. Full names ("Findlay Chapter, Order of the Eastern Star" and the rest) are also pending lodge confirmation.
- [x] **T1.9 [AGENT] Regenerate types.** Run the dev server and `npx emdash types`; commit `emdash-env.d.ts`.
  Deps: T1.5, T1.6, T1.8. Verify: `pnpm astro check` passes with code reading `body`, `term_year`, `rrule`, `include_in_newsletter` through the generated types.

  Evidence: `emdash-env.d.ts` regenerated by the dev server on a fresh database ("Generated emdash-env.d.ts (5 collections)"); `npx emdash types` needs a running instance, so the dev-start regeneration is the source. `tests/unit/emdash-types.test.ts` reads `body`, `term_year`, `rrule`, `include_in_newsletter` and `body_type` through the generated types; `astro check` fails when one drifts (checked by changing `term_year` to `string`).
### Tests
- [x] **T1.10 [AGENT] FR-9.2 seed assertion.** `tests/unit/seed.test.ts` parses `seed/seed.json` and asserts: exactly six bodies; the name → number map above (Chapter 58, Council 50); unique slugs and `display_order`; every body-scoped collection (`officers`, `events`, `news`) has a required `body` reference to `bodies` (constitution § Per-body access control); no `posts` collection and no global `tag` taxonomy.
  Deps: T1.8. Verify: `pnpm vitest run` is green; changing Council to 58 makes it fail.
  Evidence: `tests/unit/seed.test.ts` (12 tests) passes. It also asserts the body field shape (reference, required, indexed, `options.collection`, no `targetCollection`), `$ref` links, bodies first, the timezone, and that `body_type` and officer `title` options equal `TITLES_BY_BODY_TYPE`. With Council set to 58: `1 failed | 11 passed`, diff `- "Council": 50, + "Council": 58`.
- [x] **T1.11 [AGENT] Admin smoke e2e.** As the local dev admin, open `/_emdash/admin` and assert Bodies, Officers, Events, News and Pages appear and the six bodies are listed. (If admin login can't be automated before M3, document the manual check in STATUS.md and convert this to an e2e in M3.)
  Deps: T1.9. Verify: green locally and in CI, or the manual check recorded.

  Evidence: automated, no manual step needed. `tests/e2e/admin.spec.ts` (`@smoke`) signs in through EmDash's dev-only `/_emdash/api/setup/dev-bypass` (also applies the seed content), dismisses the first-run welcome dialog, and asserts Bodies, Officers, Events, News and Pages in the admin navigation, no Posts, and all six bodies in the Bodies list. `CI=true pnpm e2e --grep @smoke --trace off` on a fresh `.wrangler`: 3 passed, 4 skipped. M3 replaces the bypass with real per-role sign-in.
### M1 exit
- [ ] **T1.12 [AGENT] Close M1.** Exit check: local seeded site shows all collections; `astro check` passes against generated types; T1.10 green. Run the task-critic subagent; update STATUS.md; then task M2 in this file (PLAN §8).
  Deps: all of M1. Verify: critic returns PASS.

---

## M2 — Pure core (no I/O)
Design: every business rule is a pure function in `src/lib/core`, typed by branded ids and discriminated unions; `now` is always a parameter. Adapters in `src/lib/adapters/emdash` parse raw EmDash data into those types. Evidence below was run on a clean copy of the branch (`pnpm install --frozen-lockfile`) on 2026-11-23.

### Dependencies
- [x] **T2.1 [AGENT] Add the recurrence and calendar libraries.** `pnpm add -E rrule-temporal@2.3.0 ical-generator@11.1.4 timezones-ical-library@3.0.0 temporal-polyfill@1.0.8`; append a receipt for temporal-polyfill and timezones-ical-library to `context7-receipts.md`.
  Verify: frozen install passes; versions are exact in `package.json`; the receipt names versions, APIs and probe evidence.
  Evidence: all four pinned exactly, no release-age deviation (published 2026-11-04 to 2026-11-18). Receipt appended, including the rrule-temporal behaviors core works around.

### Shared shapes
- [x] **T2.2 [AGENT] `ids.ts` and `time.ts`.** Branded `BodyId`, `UserId`, `EntryId`, `IssueId`, `TagSlug`, `AbsoluteUrl`; `Result<T, E>`; `SITE_TZ`; half-open `TimeWindow`; fixed-English date and time formatting (no Intl).
  Verify: `pnpm astro check` 0 errors; no core function reads a clock (`grep -rn "Temporal.Now\|Date.now\|new Date" src/lib` is empty).
  Evidence: both hold.

### acl
- [x] **T2.3 [AGENT] Grant policy `authorize` + `denialText`.** Requirement per operation, then one per-editor check over the actor and `editedBy` (Admins skipped, actor first, `from` before `to`). Covers FR-5.2–5.8, D1 (an Admin actor does not launder a co-editor) and D2 (internal writes allowed).
  Verify: `tests/unit/core/acl/policy.table.test.ts`, one named test per decision-table row 0–11 with its FR id.
  Evidence: 21 table and editor-set tests green.
- [x] **T2.4 [AGENT] Exhaustive policy test.** 8 actor profiles x 9 co-editor options x 12 operations, plus internal x 12, against invariants I1 soundness, I2 named culprit, I3 Admin, I4 assign, I5 completeness, I6 no assignable body.
  Verify: `tests/unit/core/acl/policy.exhaustive.test.ts` reports 877 tests (864 cases, the count check and 12 internal) with no invariant failure; breaking the policy fails it.
  Evidence: 877 passed. Mutation: making a body change skip its `from` grant failed 14 tests (I1 soundness), then reverted.
- [x] **T2.5 [AGENT] Content rules and the title table pin.** `checkTags` (FR-3.2) and `checkOfficerTitle` (FR-2.1) against M1's `TITLES_BY_BODY_TYPE`; `denialText` is 1–500 characters with no `<` or `>`.
  Verify: `content-rules.test.ts`, `denial-text.test.ts`; a test pins every `TITLES_BY_BODY_TYPE` list exactly, since `seed.test.ts` pins only their union.
  Evidence: green. Moving "Treasurer" out of one list now fails the pin.

### recurrence
- [x] **T2.6 [AGENT] `parseRRule` (FR-4.2).** Charset check (blocks ICS injection), part whitelist with ranges, FREQ DAILY/WEEKLY/MONTHLY/YEARLY, COUNT+UNTIL, 02:xx starts refused, library validation in strict mode from an RFC 5545 DTSTART line, at least one occurrence in 5 years. The result carries the parsed parts.
  Verify: `rrule.test.ts` accepts and rejects the design's list, including `GARBAGE=1`, `BYMONTHDAY=40`, `COUNT=-3`, `FREQ=HOURLY`, an embedded `\r\nBEGIN:VEVENT`, `BYMONTH=2;BYMONTHDAY=30` and a 02:30 start.
  Evidence: green.
- [x] **T2.7 [AGENT] `expand`, `nextOccurrences`, `monthWindow`, `daysAhead` (FR-1.1, 4.3, 4.4, 4.6).** EXDATEs are local dates placed at the series' start time; occurrences overlapping the half-open window, sorted by start then title.
  Verify: `expand.test.ts` (one-off, recurring, EXDATE, both window edges, all-day, sorting, empty window) and `dst.test.ts` (the six measured DST rows as offset and wall time); dropping EXDATE removal fails tests.
  Evidence: green. Mutation: passing no EXDATEs to the library failed 2 tests, then reverted.
- [x] **T2.8 [AGENT] `describeSchedule`, `bodySchedule`, `formatOccurrence` (FR-1.3, 1.4).** "2nd Tuesday of each month, 7:30 PM", ordinal lists, last and n-th-to-last, every / every other weekday, day of month, up to four recess months, all-day without time; rrule-temporal's text otherwise.
  Verify: `describe.test.ts` asserts each shape's exact string, every fallback and the three `bodySchedule` variants.
  Evidence: green.
- [x] **T2.9 [AGENT] 100% coverage gate on acl and recurrence.** `vitest.config.ts` thresholds of 100 for branches, functions, lines and statements on `src/lib/core/acl/**` and `src/lib/core/recurrence/**`.
  Verify: `pnpm vitest run --coverage` passes and the table shows 100 on both folders.
  Evidence: acl and recurrence 100/100/100/100. Overall 100% statements, 99.39% branches; the two uncovered branches are `ics/calendar.ts:40`, a guard on timezones-ical-library's `string[] | string` return type.

### ics
- [x] **T2.10 [AGENT] `buildCalendar` (FR-4.5, Q8).** One VTIMEZONE from timezones-ical-library, DTSTAMP in UTC, RRULE verbatim, EXDATE at the series' wall time with TZID (or `VALUE=DATE` for all-day), CRLF on every line.
  Verify: `calendar.test.ts` compares against the reviewed golden `__fixtures__/blue-lodge.ics` byte for byte and checks each property separately.
  Evidence: green. `.gitattributes` keeps `*.ics` CRLF bytes as committed.

### newsletter
- [x] **T2.11 [AGENT] `nodes`, `assemble`, `issueWindow`, `excerpt` (FR-6.1).** TipTap JSON with a `container` root, one `bodySection` per body in display order, `articleCard`s newest first, then the body's events; first issue covers 90 local days, later issues start at the last issue's coverage end.
  Verify: `assemble.test.ts`, `window.test.ts`, `excerpt.test.ts`.
  Evidence: green.
- [x] **T2.12 [AGENT] `broadcastKey` and the issue lifecycle (FR-6.5–6.7).** Key `fm-issue:<id>:rev:<n>`; approve refuses an issue not test-sent at its current revision; unlisted transitions are refused.
  Verify: `key.test.ts`, `lifecycle.test.ts`.
  Evidence: green.

### Adapters and structure
- [x] **T2.13 [AGENT] `src/lib/adapters/emdash/parse.ts`.** Mints brands from raw entry data: ULID ids, `[{ tag }]` and `[{ slug, label }]` repeaters, UTC instants to SITE_TZ wall time, events (all-day midnight end is exclusive, end before start refused, rule parsed with its timing), editors (role >= 50 is Admin).
  Verify: `tests/unit/adapters/emdash/parse.test.ts`.
  Evidence: green, 100% branch coverage.
- [x] **T2.14 [AGENT] Keep the core pure by lint.** oxlint `no-restricted-imports` on `src/lib/core/**` bans `emdash`, `@emdash-cms/*`, `resend`, `astro`, `astro:*`, `node:*` and `cloudflare:*`, subpaths included.
  Verify: a probe file in `src/lib/core` importing each one fails `oxlint`; the same file under `src/lib/adapters` passes.
  Evidence: 9 of 9 probe imports flagged (`node:fs`, `node:fs/promises`, `emdash`, `emdash/ui`, `cloudflare:workers`, `astro:env/server`, `resend`, `astro/config`, `@emdash-cms/cloudflare`); `temporal-polyfill` allowed; probe deleted.
- [x] **T2.15 [AGENT] M1 test follow-ups.** The `$ref` body assertion in `seed.test.ts` also runs on `tests/unit/__fixtures__/seed-body-refs.json` (one officer, event and news item), and a broken copy proves it reports a raw id and a dangling `$ref`.
  Verify: `pnpm vitest run tests/unit/seed.test.ts`.
  Evidence: green.

### M2 exit
- [x] **T2.16 [AGENT] TypeScript Design Principles Gate on `src/lib/**`.** Record T1–T8 in STATUS.md.
  Verify: STATUS.md table.
  Evidence: T1–T8 pass; T2 notes seven documented brand-mint assertions in core.
- [ ] **T2.17 [AGENT] Close M2.** Exit check: `vitest run` green with 100% branch coverage on acl and recurrence; CI green; task-critic PASS; update STATUS.md.
  Deps: all of M2. Verify: critic returns PASS.

---

## M3 — Authentication and the `body-access` plugin
Design: [ADR-002](../../adr/ADR-002-body-access-middleware.md). One policy, core's `authorize`, with two callers: the native `body-access` plugin's hooks and `src/middleware.ts`, which guards the EmDash writes no hook sees. Evidence below was run in a clean copy outside the worktree (`pnpm install --frozen-lockfile`) on 2026-11-23.

### Core
- [x] **T3.1 [AGENT] Extend the grant policy.** `StateChange` gains `restore`, `unschedule` and `discard`. State changes and updates carry the entry's stored bodies (live, then the draft's), so a draft that moves an entry needs both grants (decision 3). New operations: `media` (uploader or Admin, decision O1) and `admin-only` (MCP, adding a body, unlisted routes). A state change on an entry with no body is Admin-only.
  Verify: `policy.table.test.ts` rows 10 and 12 to 15; the exhaustive test enumerates every operation; 100% coverage on `src/lib/core/acl`.
  Evidence: 22 operations x 72 actor and co-editor profiles = 1584 cases, no invariant failure. acl 100/100/100/100. Mutation: checking only the first stored body failed 12 tests (I1 soundness), then reverted.
- [x] **T3.2 [AGENT] Plain-text messages for RRULE and parse errors (M2 follow-up).** `rruleErrorText` covers every `RRuleError`, including the skipped spring-forward hour; `parseErrorText` covers the parse errors.
  Verify: `rrule.test.ts` and `parse.test.ts` assert a distinct plain message per error; `rules.spec.ts` sees them on an event save.
  Evidence: green; the e2e save of a 2:30 AM weekly event returns "…between 2:00 and 2:59 AM, because those times are skipped on the spring daylight-saving day…".
- [x] **T3.3 [AGENT] Escape the ICS calendar name (M2 verification follow-up).** `NAME` and `X-WR-CALNAME` were written verbatim by ical-generator; CR/LF now collapse and `,` `;` `\` are escaped.
  Verify: `calendar.test.ts` builds a feed from a name carrying `\r\nBEGIN:VEVENT`.
  Evidence: green; without the fix the test fails (1 failed, 8 passed).

### Adapters
- [x] **T3.4 [AGENT] `actor-context.ts`.** One `AsyncLocalStorage` on `globalThis` (`Symbol.for`); the middleware writes it, `beforeDelete` and `media:beforeUpload` read it.
  Verify: the production-build trash denial below.
  Evidence: with the middleware's DELETE row bypassed, the production build under `wrangler dev` answers a Lodge editor's trash of Chapter news with `400 DELETE_BLOCKED` from the hook, which allows when it reads no actor.
- [x] **T3.5 [AGENT] `grants.ts`.** Grant rows in plugin storage (`userId`, `bodyId`, replace-all, idempotent) for the plugin and the middleware; `principalFor` builds one `Editor` per user id from one role and one grants lookup (M2 verification follow-up).
  Verify: `grants.test.ts`.
  Evidence: green; with the actor listed in its own `editedBy` and a co-editor listed twice, each user gets one grants lookup and each co-editor one role lookup.
- [x] **T3.6 [AGENT] `entries.ts`, `route-table.ts`, `request-guard.ts`.** Collection scopes (body field, the body itself, site, unlisted is Admin-only); every unsafe EmDash route classified by its injected pattern; the middleware's decision through `authorize`.
  Verify: `entries.test.ts`, `route-table.test.ts`.
  Evidence: green; the test reads all 219 routes EmDash 1.6.0 injects and finds every unsafe method classified.

### Plugin
- [x] **T3.7 [AGENT] Hooks.** `beforeSave` (actor and every `editedBy`, live and draft body, `translationOf`, FR-5.5 assign, the body must exist, FR-3.2 tags, FR-2.1 officer titles, FR-4.2 RRULE); `beforePublish`/`beforeSchedule` (live and draft body), `beforeUnpublish`; `beforeDelete` and `media:beforeUpload` as backstops.
  Verify: the e2e suites.
  Evidence: `writes.spec.ts` and `rules.spec.ts` green.
- [x] **T3.8 [AGENT] Routes.** `grants/list` (GET) and `grants/set` (POST, replace-all) with `users:manage`; `my-bodies` (GET) with `content:create`.
  Verify: `grants.spec.ts`; `body-access.test.ts` pins methods and permissions.
  Evidence: green; an Editor gets 403 from both grant routes.
- [x] **T3.9 [AGENT] Admin UI.** The Body Access page (Admin only, a grant matrix with a Save per user) and the `body` field widget (the editor's bodies plus the current one; a single grant is preselected).
  Verify: `grants.spec.ts`, `ui.spec.ts`.
  Evidence: green for admin, blue-lodge, chapter and unassigned-editor.
- [x] **T3.10 [AGENT] Structural tests.** The capability table against `createPlugin().capabilities`, and EmDash's `HookPipeline` registering every guard hook; the route table against `node_modules/emdash` `routes.ts`.
  Verify: misspell a capability; remove two route rows.
  Evidence: a misspelt `hooks.content-policy:register` fails 3 tests ("Invalid capability"); a valid but wrong capability fails 2 ("…skipping"); removing the PUT and restore rows fails `route-table.test.ts`, naming both routes. All reverted.

### Request middleware
- [x] **T3.11 [AGENT] `src/middleware.ts`.** Wraps `next()` in the actor store; refuses below Admin through the route table: the data-less PUT, trash, restore, duplicate, discard, unschedule, revision restore, recovery revisions, locks, rooms, terms, plugin extensions, rejection clearing, uploads, media items and MCP; an unlisted unsafe `/_emdash` route fails closed.
  Verify: `middleware.spec.ts`, `mcp.spec.ts`; the bypass regression.
  Evidence: green. With the PUT and restore rows set to pass, a Lodge editor re-slugs a published Chapter entry and restores a trashed one (200), and the matching tests fail; reverted. Review found one more path: `duplicate` and `terms` resolve a slug without the request's locale, so a Chapter slug with `?locale=zz` slipped past the guard and was duplicated (201). The guard now reads the entry with and without the locale and refuses when neither finds it; the new test failed before the fix and passes after it.

### Configuration (PATH_ASK)
- [ ] **T3.12 [PATH_ASK] `astro.config.mjs`.** The `body-access` plugin descriptor; `authProviders: [google(), microsoft()]` (FR-8.2); `MICROSOFT_TENANT_ID` in the env schema; `optimizeDeps.include` for `@cloudflare/kumo`, which the providers' sign-in buttons import from source.
  Verify: `astro check`, `astro build`; CI green; the human approves the PR.
  Agent part done, awaiting approval. Without the kumo entry the admin's dev loads took 7 to 8 s and Vite reloaded mid-session (CI run 45260287484 failed); with it, 2.6 to 3.7 s (CI run 45266276314 green).
- [ ] **T3.13 [PATH_ASK] `seed/seed.json` widget.** `"widget": "body-access:body"` on the three `body` fields.
  Verify: `seed.test.ts`; the body field e2e; the human approves the PR.
  Agent part done, awaiting approval. An existing database keeps its old field settings until an Admin sets the widget on each `body` field.

### Docs and tests
- [x] **T3.14 [AGENT] Runbook `docs/runbooks/onboard-body-editor.md`.** Invite, accept, grant, check, change or remove, troubleshooting, sign-in options.
  Verify: the invite route returns a link when no email provider is configured (read from EmDash 1.6.0).
  Evidence: written.
- [x] **T3.15 [AGENT] Playwright per-role suites.** The setup project signs in seven accounts through the dev-only bypass (each borrows the dev address in turn) and saves their storage states; 36 tests in `tests/e2e/body-access/`; CI runs every suite.
  Verify: `CI=true pnpm e2e --trace off`; CI green on both legs.
  Evidence: 40 passed locally on a fresh database (36 in `tests/e2e/body-access/`); CI green on both legs.
- [x] **T3.16 [AGENT] ADR-002.** Why hooks alone are not enough, the middleware design, the media default, MCP denial, residual risks.
  Verify: `docs/adr/ADR-002-body-access-middleware.md`.
  Evidence: written, status Proposed until the PR lands.

### M3 red-team fixes
Two red teams reviewed feb8594. The code review found eight issues (five confirmed live, three suspected). The live HTTP attack found no bypass in 61 attempts and added three follow-ups (a to c). Each fix below has a test that failed before the fix and passes after it. Evidence was run in a clean copy outside the worktree (`pnpm install --frozen-lockfile`, its own portless name) on 2026-11-23. Design: [ADR-002](../../adr/ADR-002-body-access-middleware.md) § The route table and § Accepted residual risks.

- [x] **T3.19 [AGENT] Finding 1: guard every entry a route's `[id]` could name.** A recovery revision reached another body's trashed entry, because the guard read the entry outside the trash while EmDash's handler read it trash included. Each `entry` rule now names its handler's lookup (`live`, `trash` or `id`). The middleware reads the entry by id, by slug with no locale and by slug in the request's locale, each draft strictly, and authorizes every entry it finds. Revision restores check every entry the revision's entry id could name.
  Verify: `route-table.test.ts` reads each entry route's handler and fails when a lookup is missing or differs; `request-guard.test.ts`; `middleware.spec.ts` (both red-team variants).
  Evidence: before, the lookup test listed all 13 entry rules as "table undefined", and both e2e variants returned 201 (the revision landed on the Chapter's trashed entry). After, 403 naming the Chapter. Mutations: reading outside the trash on a trash route fails 4 guard tests; dropping the locale-less slug read fails 1.
- [x] **T3.20 [AGENT] Defense in depth: no id-shaped slugs below Admin.** The middleware reads `slug` from the body of every save route (`SAVE_ROUTES`) and refuses one matching EmDash's id test with `422 INVALID_SLUG` and a plain reason.
  Verify: `route-table.test.ts` derives the save routes from EmDash's request schemas; `request-guard.test.ts`; `middleware.spec.ts`.
  Evidence: before, an Editor's create with an id-shaped slug returned 201. After, create, PUT and recovery revision each return 422, and a word slug still saves.
- [x] **T3.21 [AGENT] Finding 2: no lookup keyed by request input reads `Object.prototype`.** `COLLECTION_SCOPES` and `ROUTE_TABLE` are Maps; a method is matched with `Object.hasOwn`. A grep of `src/` for computed index reads found one more lookup keyed by input, the RRULE part table in `core/recurrence/rrule.ts`. Its keys are uppercased and charset-checked first, so no prototype name could match, but it is a Map now too. The rest are keyed by validated values (`isBodyType` already uses `Object.hasOwn`) or internal unions.
  Verify: `entries.test.ts`, `route-table.test.ts`.
  Evidence: before, `scopeOf` returned an inherited value for `constructor`, `toString`, `__proto__`, `hasOwnProperty` and `valueOf` (5 failures). After, all five are unlisted; the re-run probe 3 gets 422 for an Editor's entry in a `constructor` collection.
- [x] **T3.22 [AGENT] Finding 3: unpublish checks the draft's body.** EmDash hands `beforeUnpublish` the live entry only. The middleware now guards unpublish as an `entry` rule, and every policy hook reads the entry and its draft itself.
  Verify: `middleware.spec.ts`, `hooks.test.ts`, `request-guard.test.ts`.
  Evidence: before, a Lodge editor unpublished a Lodge entry whose draft moved it to the Chapter (200). After, 403 naming the Chapter, and the entry stays published. `writes.spec.ts` now expects the middleware's 403 for a cross-body unpublish.
- [x] **T3.23 [AGENT] Finding 4 (coordinator decision): only an Admin trashes, unpublishes or schedules a body's page.** Core gains a `body-page` operation and the `retire-body` Admin action; the adapter maps every state change on a `bodies` entry to it. A save that sets `status` counts as an unpublish, so a data-less PUT cannot take the page offline either.
  Verify: `policy.table.test.ts` rows 16 and 17; the exhaustive test (30 operations, 2160 cases); `writes.spec.ts`; `hooks.test.ts`.
  Evidence: before, the Council editor unpublished the Council page (200). After, unpublish, PUT `status`, trash (403) and schedule (422) are refused with "cannot trash, unpublish or schedule a body's page", and the editor still edits the page.
- [x] **T3.24 [AGENT] Finding 5: a media lookup failure refuses.** Only a missing item passes to EmDash, which answers 404; any other failure of a guard read refuses and is logged.
  Verify: `request-guard.test.ts`.
  Evidence: with the old behavior restored (any failure reads as missing), "refuses when the item cannot be read" fails; with the fix it passes.
- [x] **T3.25 [AGENT] Finding 6: a write with no event actor is held to the request's user.** `beforeSave`, `beforeDelete`, the policy hooks and `beforeUpload` act for the event's actor, else the signed-in user in the actor store. Only a write outside any signed-in request is internal; scheduler and system policy events stay internal.
  Verify: `hooks.test.ts`.
  Evidence: against the original hooks, "holds a write with no event actor to the signed-in user" failed; after, it passes, and writes outside a signed-in request still pass.
- [x] **T3.26 [AGENT] Finding 7: a pending draft that cannot be read refuses.** The middleware and the hooks share `overlayDraft`, which returns null for a missing draft; both refuse instead of checking the live body alone.
  Verify: `entries.test.ts`, `request-guard.test.ts`, `hooks.test.ts`.
  Evidence: the hooks test failed against the original hooks; the guard test fails with the old non-strict read restored.
- [x] **T3.27 [AGENT] Finding 8: translations stay in one body.** A new translation must belong to its source's body (`checkTranslationBody` in core). EmDash's group-wide writes run only with two or more Astro i18n locales; `translations.test.ts` fails if `astro.config.mjs` gains an `i18n` block. ADR-002 residual risk 7 records the rest.
  Verify: `content-rules.test.ts`, `hooks.test.ts`, `writes.spec.ts`, `translations.test.ts`.
  Evidence: before, a two-body editor created a Lodge translation of a Chapter entry (201). After, 422 naming the Chapter; a Chapter translation still saves.
- [x] **T3.28 [AGENT] Follow-up a: self-minted Editor tokens.** ADR-002 risk 4 said only an Admin creates tokens; an Editor can mint one through public client registration and the device flow. Corrected, with an e2e test.
  Verify: `mcp.spec.ts`.
  Evidence: the self-minted token writes the Editor's own body (201) and is refused another body's entry and MCP (403). It passed before the fixes too: it proves a property, not a regression.
- [x] **T3.29 [AGENT] Follow-up b: identical uploads.** Decision: keep EmDash's content-hash deduplication; the `not-uploader` refusal explains that the library kept the first uploader's copy, which the editor can still use. Recorded in ADR-002 § Media default.
  Verify: `denial-text.test.ts`; `middleware.spec.ts`.
  Evidence: before, the refusal never mentioned an identical file. After, it does, and the second upload still returns the first record with `deduplicated: true`.
- [x] **T3.30 [AGENT] Follow-up c: unique fixture bytes.** `uniquePng()` adds a random text chunk to the 1x1 PNG, so no media test collides with EmDash's deduplication on a shared database.
  Verify: `middleware.spec.ts` on a database reused across runs.
  Evidence: green on a fresh database and on reruns (STATUS.md log).

### Human and close-out
- [ ] **T3.17 [HUMAN] Sign-in on staging (FR-8.2).** Store the Google and Microsoft credentials and `MICROSOFT_TENANT_ID` as Worker secrets and vars; on staging, invite an editor, accept with a passkey and with each provider, and grant a body.
  Deps: T0.16. Verify: the runbook's step 4 passes for each sign-in method.
- [ ] **T3.18 [AGENT] Close M3.** Exit check: FR-5 e2e green locally and in CI; task-critic PASS; update STATUS.md.
  Deps: all of M3. Verify: critic returns PASS.

---

## M5 — Newsletter plugin
Design: [ADR-003](../../adr/ADR-003-newsletter-plugin.md). M5 runs ahead of M4, whose design gate is pending, so the archive and signup form are minimal and the email theme is a placeholder. Evidence below was run on a clean copy of the committed tree (`git archive HEAD`, `pnpm install --frozen-lockfile`) outside the repo on 2026-11-23. No real Resend or Turnstile call was made: tests use a fake Resend API (a `fetch` stub) and the dev server's in-memory fakes.

### Research
- [x] **T5.1 [AGENT] Receipts for resend 6.39, @react-email/editor 1.8.10 and Turnstile siteverify.** Read from `node_modules` and the Cloudflare docs.
  Verify: [context7-receipts.md](../../spec/findlay-masonic-platform/context7-receipts.md).
  Evidence: `broadcasts.create` has no idempotency option (R3 confirmed); `composeReactEmail` needs an `Editor`, and a headless one needs `@tiptap/core` as a direct dependency, which re-resolved EmDash admin's TipTap peers in the lockfile (tried and reverted); siteverify's contract and test keys.

### Core
- [x] **T5.2 [AGENT] `refreshEvents` (R13), `withFooter`, `archiveHtml`, `issueSlug`; node attribute defaults for the editor.**
  Verify: `events.test.ts`, `email-html.test.ts`.
  Evidence: green; `src/lib/core/newsletter` 100% statements, functions and lines.

### Adapters
- [x] **T5.3 [AGENT] `resend-mailer.ts`: the mailer port and its Resend implementation.** Send email (cc, reply-to), find a broadcast by name, create or start one, upsert a contact into the Segment and Topics.
  Verify: `tests/unit/adapters/resend-mailer.test.ts` against a fake Resend API.
  Evidence: 8 tests green: the request each call sends (path, body, `Authorization`, `Idempotency-Key`), a paged lookup, contact create versus add-and-update, and 422 as a refusal but 500, 429 and a network failure as an unknown outcome.
- [x] **T5.4 [AGENT] `turnstile.ts`, `clock.ts`, `providers.ts`, `dev-fakes.ts`, and the issue and content adapters.**
  Verify: `turnstile.test.ts`, `providers.test.ts`, `newsletter/issues.test.ts`, `newsletter/content.test.ts`.
  Evidence: green. Siteverify gets the secret, token and IP; a missing token never calls Cloudflare; Cloudflare's own failure is never a pass.
- [x] **T5.5 [AGENT] Keep Resend server-side by lint.** oxlint: `resend` only in `resend-mailer.ts`, the mailer only in `src/plugins/newsletter/*.ts` (not its `.tsx` admin modules), neither in core; ESLint repeats the ban for `.astro` frontmatter.
  Verify: probe imports of `resend` and `@adapters/resend-mailer` in a page endpoint, a component, a core file, the newsletter admin `.tsx`, a body-access module and a newsletter route.
  Evidence: 11 oxlint errors and 2 ESLint errors; the newsletter route was flagged for the SDK only. Probes deleted.

### Plugin
- [x] **T5.6 [AGENT] Issue storage and the issue service (FR-6.1 to 6.4).** Plugin storage `issues` holds the TipTap JSON, the saved email, coverage window, revision, tested revision, status, key, Broadcast id, sent HTML and archive slug. New issue (core `assemble` and `issueWindow`; reopens the open issue), save (an unchanged save keeps the revision), test send to `NEWSLETTER_TEST_ALLOWLIST` only, discard.
  Verify: `tests/unit/plugins/newsletter/service.test.ts`.
  Evidence: 18 tests green, including FR-6.6 refusing approval before any test send and after an edit that followed one, with no Broadcast created.
- [x] **T5.7 [AGENT] Idempotent approval (FR-6.5 to 6.7, R3, R13).** `step(approve)`, then the event refresh, then a compare-and-set hold, then find by key, else create.
  Verify: the "approve is idempotent" tests.
  Evidence: two approvals, sequential or concurrent, make one create; a crash between Resend and the store, and a timeout after Resend made the Broadcast, are each retried without a second create; a Broadcast left as a Resend draft is started, not recreated. Mutations: ignoring the compare-and-set result fails the concurrent test; skipping the key lookup fails three tests. Both reverted.
- [x] **T5.8 [AGENT] `email:deliver` transport (FR-8.1).** Registered only when Resend can send (`RESEND_API_KEY` and `RESEND_FROM`, or the dev fake), so until a human sets the keys EmDash keeps showing invite links instead of failing them.
  Verify: `transport.test.ts`; `providers.test.ts` (`deliversEmail`); `plugin.test.ts` builds EmDash's `HookPipeline` from the plugin.
  Evidence: green; cc and reply-to reach Resend; the hook registers (capability `hooks.email-transport:register`).
- [x] **T5.9 [AGENT] Public subscribe route (FR-7.1, 7.2).** Form post, zod, Turnstile, Origin rule, contact upsert with the newsletter Topic and each ticked body's `resend_topic_id`.
  Verify: `subscribe.test.ts`; e2e `subscribe.spec.ts`.
  Evidence: green.
- [x] **T5.10 [AGENT] Newsletter admin page.** `EmailEditor` with `bodySection` and `articleCard` `EmailNode`s built from core's node names and attributes, the placeholder theme in `theme.ts`, compose on save, Admin gate as on Body Access; routes need `settings:manage` (Admin).
  Verify: e2e `builder.spec.ts`, `editor.spec.ts`; `plugin.test.ts`.
  Evidence: green.
- [x] **T5.11 [AGENT] Archive (FR-6.8).** `/newsletters` and `/newsletters/[slug]`; the sent HTML in a sandboxed `iframe srcdoc`, never `set:html`; an empty state.
  Verify: e2e `builder.spec.ts` (archive), `newsletter-archive.empty.spec.ts`.
  Evidence: green on a fresh database.
- [x] **T5.12 [AGENT] Fakes only under `astro dev`.** `chooseProvider` returns a fake only when `import.meta.env.DEV`; the fake module is imported only in that branch; `tests/build/check-dist.mjs` runs in CI after the build.
  Verify: `providers.test.ts`; `node tests/build/check-dist.mjs`.
  Evidence: the build passes all 14 checks, including no fake and no outbox route in the server bundle and no Resend SDK or key-shaped string in the client bundle. With the DEV guard replaced by `true` in `runtime.ts` and `routes.ts`, the build fails 2 checks (`dev-fakes_*.mjs` and the outbox route); reverted.
- [ ] **T5.13 [PATH_ASK] `astro.config.mjs`.** The `newsletter` native plugin descriptor; `RESEND_FROM` and `RESEND_FAKE` in the env schema.
  Verify: `astro check`, `astro build`; CI green; the human approves the PR.
  Agent part done, awaiting approval.
- [x] **T5.20 [AGENT] Classify every plugin route (after the M3 red-team fixes).** The route table passes `/_emdash/api/plugins/[pluginId]/[...path]` to EmDash; `PLUGIN_ROUTES` in `route-table.ts` records each body-access and newsletter route's guard: the permission EmDash checks (`users:manage` and `settings:manage` are Admin only, `my-bodies` needs `content:create`), or a public route's own checks (`newsletter/subscribe`).
  Verify: `tests/unit/route-table.test.ts` "native plugin routes".
  Evidence: green. Dropping `newsletter/dev/outbox` from the map and giving `issues/approve` `content:create` fails both checks, naming the routes; reverted.

### Tests and docs
- [x] **T5.14 [AGENT] Playwright newsletter suites.** Admin: start an issue, see a section per body, edit, approval refused, test send, approval, a second approval refused, the archive. Editor: page and every route refused. Visitor: signup, no token refused, cross-origin refused. Empty archive first, in its own project.
  Verify: `CI=true pnpm e2e --trace off`.
  Evidence: 55 passed after rebasing onto the M3 red-team fixes (48 from M3 and 7 new).
- [x] **T5.15 [AGENT] ADR-003, runbook `docs/runbooks/newsletter-send.md`, STATUS.**
  Verify: the documents.
  Evidence: written.

### Human and close-out
- [ ] **T5.16 [HUMAN] Resend and Turnstile on staging.** Verify the sending domain; create the `subscribers` Segment (and a staging-only test Segment), the newsletter Topic and one Topic per body (default opt-out), and save each body Topic's id on the body; set `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID`, `NEWSLETTER_TEST_ALLOWLIST`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`.
  Deps: T0.16. Verify: the runbook's "Before the first send" table is complete on staging.
- [ ] **T5.17 [HUMAN] Staging send test (PLAN M5 exit check).** A test send reaches the allowlisted inbox; an approved Broadcast to the staging-only Segment is received with a working unsubscribe link; an EmDash invite arrives by email (FR-8.1); a signup appears in Resend with its Topics. Note whether Resend honoured `Idempotency-Key` on the Broadcast and how it answered adding an existing contact to the Segment.
  Deps: T5.16. Verify: the runbook passes end to end on staging.
- [ ] **T5.18 [HUMAN] Checkly HeartbeatMonitor for scheduled sends.**
  Deps: T5.17. Verify: the heartbeat goes green after a scheduled staging send.
- [ ] **T5.19 [AGENT] Close M5.** Exit check: CI green on both legs; task-critic PASS; update STATUS.md.
  Deps: all of M5. Verify: critic returns PASS.

---

## Carried forward (tasked in full when the milestone starts)
- [ ] **T8.0 [HUMAN] Production resources.** Create the production D1, R2 bucket (`findlay-masonic-media-production`) and KV namespace, and the Axiom dataset with OTLP destinations `axiom-production-logs` / `axiom-production-traces`; paste the IDs into `env.production` in `wrangler.jsonc`. Decide first whether the existing D1 `findlay-masonic-site` becomes production (T0.11).
  Verify: `tests/unit/wrangler-envs.test.ts` compares the real IDs and passes; `pnpm wrangler d1 list` shows the production DB.
