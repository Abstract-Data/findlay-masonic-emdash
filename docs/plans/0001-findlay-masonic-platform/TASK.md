# TASK — 0001-findlay-masonic-platform (M0, M1, M2)
**SDD phase:** 3 (TASKS)
**Plan:** [PLAN.md](PLAN.md) (approved 2026-11-23) · **Status:** [STATUS.md](STATUS.md)
**Scope:** M0, M1 and M2. Later milestones are tasked when their predecessor's exit check passes (PLAN §8).

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

## Carried forward (tasked in full when the milestone starts)
- [ ] **T8.0 [HUMAN] Production resources.** Create the production D1, R2 bucket (`findlay-masonic-media-production`) and KV namespace, and the Axiom dataset with OTLP destinations `axiom-production-logs` / `axiom-production-traces`; paste the IDs into `env.production` in `wrangler.jsonc`. Decide first whether the existing D1 `findlay-masonic-site` becomes production (T0.11).
  Verify: `tests/unit/wrangler-envs.test.ts` compares the real IDs and passes; `pnpm wrangler d1 list` shows the production DB.
