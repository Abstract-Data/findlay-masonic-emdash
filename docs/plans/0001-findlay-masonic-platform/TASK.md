# TASK — 0001-findlay-masonic-platform (M0 to M5, M7)
**SDD phase:** 3 (TASKS)
**Plan:** [PLAN.md](PLAN.md) (approved 2026-11-23) · **Status:** [STATUS.md](STATUS.md)
**Scope:** M0 to M5, the M4 verification fixes and M7. M5 ran ahead of M4's design gate, and M4's functional half runs ahead of it too. Later milestones are tasked when their predecessor's exit check passes (PLAN §8).

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

## M4 — Public site
The functional half of M4 runs ahead of its design gate: every route, the data flow and plain semantic markup on the template's classes, so the chosen direction restyles `theme.css` and the components in `src/components/` without touching the pages' data flow. Evidence below was run on a clean copy of the committed tree (`git archive HEAD` into `/tmp/m4run`, `pnpm install --frozen-lockfile`, a fresh database) on 2026-11-23. Every page check runs as an anonymous visitor; content is seeded through the API as Admin.

### Design (operator)
- [x] **T4.1 [HUMAN] Choose the design direction (A Framed Lodge, B Temple or C Noticeboard).** Direction A needs FR-4.4 amended to "labelled by body"; B and C change `astro.config.mjs` fonts (PATH_ASK).
  Verify: the operator names a direction.
  Evidence: the operator chose C, 2026-11-24. The mockup, its notes and the reference screenshots are recorded in `docs/design/direction-c/`.

### Core and adapters
- [x] **T4.2 [AGENT] Pure rules for the public pages.** `core/calendar/month` (Sunday-first grid, agenda, `?month=`), `core/recurrence/meetings` (schedule and next stated meetings, an ended rule names no schedule), `core/bodies/officers` (current term is the latest that has begun), `core/bodies/label` ("Lodge 227"), `core/news/paging` (ten a page).
  Verify: `pnpm vitest run --coverage`.
  Evidence: 2738 unit tests green in 43 files; `core/calendar`, `core/bodies`, `core/news` and `core/recurrence` (with `meetings.ts`) at 100% statements, branches, functions and lines, so the recurrence threshold holds.
- [x] **T4.3 [AGENT] Site adapter.** `src/lib/adapters/site`: loaders through `getEmDashCollection`/`getEmDashEntry` (never `locals.emdash.db`, which anonymous visitors lack), throwing on a failed read; views (a body carries `acceptsMessages`, never the addresses); `paths`; `cacheRoute` with `CLOCK_BOUND` for pages that show what comes next; `calendarResponse` around core `buildCalendar`.
  Verify: `tests/unit/adapters/site/views.test.ts`; the e2e below run as a visitor.
  Evidence: green; `grep -rn "locals.emdash" src/components src/pages src/lib/adapters/site` finds nothing outside the newsletter archive pages (not M4's).

### Routes and components
- [x] **T4.4 [AGENT] Routes, all server-rendered.** `/`, `/bodies`, `/bodies/[slug]`, `/bodies/[slug]/news`, `/bodies/[slug]/news/[news]`, `/news`, `/news/[slug]` (redirect: the news `urlPattern` cannot name the body), `/calendar`, `/bodies/[slug]/calendar`, `/calendar.ics`, `/bodies/[slug]/calendar.ics` (`text/calendar`), `pages/[slug]` with the contact form on `contact`. Components: BodyCard, BodyCards, ScheduleBlock, OfficerList, NewsList, MonthGrid, Agenda, CalendarFilter, MonthNav, Pager, FeedLinks, ContactForm, Turnstile. Every list has an empty state, including FR-1.4's "Contact the secretary for meeting times." Calendar entries carry `data-body="<slug>"` and a text label, uncoloured until T4.12.
  Verify: e2e `tests/e2e/public/*`; no `client:` directive, no `set:html`; page script tags.
  Evidence: 15 `public` e2e green, every page as a visitor. The only scripts on the new pages are the layout's existing ones (theme, header height, search shortcut) and EmDash's LiveSearch; Turnstile's script loads only when `TURNSTILE_SITE_KEY` is set.
- [x] **T4.5 [AGENT] News detail page and newsletter links (R8).** Newsletter article cards link to `/bodies/<body>/news/<news>` through `paths.newsItem`.
  Verify: `tests/unit/adapters/newsletter/content.test.ts`; e2e "R8".
  Evidence: the e2e assembles a real issue and finds the card's link, and the page answers 200 to a visitor; `/news/<slug>` answers 302 to it; the same slug under another body is 404.
- [x] **T4.6 [AGENT] Per-body contact form (spec Q12).** Route `newsletter/contact` (public, classified in `PLUGIN_ROUTES`): Origin or `X-EmDash-Request`, zod, Turnstile, five messages per sender and body an hour (plugin KV, SHA-256 key, compare-and-set), then `ctx.email.send` through `email:deliver` to the body's `contact_recipients`, reply-to the visitor. The plugin gains `email:send`; `astro.config.mjs` is unchanged.
  Verify: `tests/unit/plugins/newsletter/contact.test.ts`, `plugin.test.ts`, `route-table.test.ts`; e2e "Q12" (three tests) with the dev fake.
  Evidence: green. The visitor's email reaches the recipient with reply-to set; the address appears on none of six public pages; the anonymous content API answers 401; another site's Origin and no Origin are 403; a missing token is `verification-failed`; the sixth message in an hour is `rate-limited`.

### Leftovers from M1 and M2
- [x] **T4.7 [AGENT] Dead blog CSS, stale wording, menu links.** Removed `.empty-state*` and `.icon-btn` from `Base.astro` (a script listed every class the layout and stylesheets define that nothing under `src/` uses; the rest are applied at runtime by EmDash's PortableText, LiveSearch and WidgetArea). `.post-grid` stays as the body card grid. README rewritten for the site; AGENTS.md loses the blog wording and the comments section and gains a "Public pages" rule; `resolveSiteIdentity` loses its blog name and defaults.
  Verify: e2e "every main menu link resolves".
  Evidence: Home, Bodies, Calendar, News and About each answer 200.

### Tests, accessibility, performance and gates
- [x] **T4.8 [AGENT] Playwright e2e for FR-1.x, 2.2, 3.3, 3.4, 4.3 to 4.5, 6.8 and 9.1.** Project `public`, after the newsletter suite (they share the dev outbox). FR-6.8's empty archive stays in M5's `newsletter-archive.empty.spec.ts`. FR-9.1 checks the routes render the pages collection's Home, About, Scholarships and Contact; the copy is migrated in M6, so the test creates the missing pages first.
  Verify: `CI=true pnpm e2e --trace off` on a fresh database.
  Evidence: 91 passed with `CI=true` on a fresh database: 57 from M3 and M5, 15 `public`, 19 `a11y`. The `public` tests by requirement: FR-1.1 and 1.3, FR-1.2, FR-1.4, FR-2.2, FR-3.3, FR-3.4, R8, FR-4.3, FR-4.4, FR-4.5 (the feed's `RRULE`, `EXDATE;TZID=America/New_York` and `VTIMEZONE` lines), FR-9.1, the main menu's links, and three for Q12.
- [x] **T4.9 [AGENT] axe AA, zero violations.** `@axe-core/playwright` 4.14.0 pinned exactly (receipt in `context7-receipts.md`); project `a11y` runs after `public`, so lists hold content. 17 public routes in light and dark mode (asserting the dark palette really renders), and the Body Access and Newsletter admin pages scoped to each plugin's own page.
  Verify: the `a11y` project.
  Evidence: 19 green: 0 violations on each of 17 public routes in light and dark mode, and on the Body Access and Newsletter pages. EmDash's admin shell around the plugin pages has one finding of its own, `label-content-name-mismatch` on a base-ui control, the same on every admin page.
- [x] **T4.10 [AGENT] Local P95 server time per route.** `node tests/perf/p95.mjs <url> 50` reads EmDash's `Server-Timing: mw`.
  Verify: the table in STATUS.md.
  Evidence: on the dev server with the e2e data, uncached, server P95 is 28 to 70 ms per route. A local indicator only: it runs local SQLite, not D1 over the network. The budget (P95 < 300 ms cached) is measured in M7.
- [x] **T4.11 [AGENT] Astro Design Principles Gate (A1 to A12) and the TypeScript gate on `src/lib`.**
  Verify: STATUS.md "Design principles gates (M4)".
  Evidence: all pass.

- [ ] **T4.15 [PATH_ASK] `TURNSTILE_SITE_KEY` read at runtime.** `astro.config.mjs`: `server`/`secret` instead of `client`/`public`, read from `astro:env/server` in `Turnstile.astro`, the only reader (server-rendered). `wrangler.jsonc` declares it in both environments' `vars`; `worker-configuration.d.ts` regenerated; the runbook, `.dev.vars.example` and ADR-003 updated. `tests/build/check-runtime-env.mjs` lists it as runtime, with `PORTLESS_URL` (passed to EmDash's `siteUrl`, which the build writes into the bundle) as the new inlined control, since no string `astro:env` field is inlined any more.
  Verify: `node tests/build/check-runtime-env.mjs`; `tests/unit/wrangler-envs.test.ts`; the e2e signup and contact suites; the human approves the PR.
  Agent part done, awaiting approval: all 8 checks pass and the control is found in 3 files. With the old `client` field put back, the check fails: `FAIL TURNSTILE_SITE_KEY is read at runtime, not inlined: server/chunks/Turnstile_*.mjs`.

### Waiting on the design decision
- [x] **T4.12 [AGENT] Restyle to the chosen direction.** `theme.css` overrides and the components above; FR-4.4 colour coding on the existing `data-body` hooks (or the spec amendment, for direction A); the email theme in `src/plugins/newsletter/theme.ts`.
  Deps: T4.1. Verify: axe still clean; screenshots at 1280 and 390 px in both colour schemes.
  Evidence: direction C built (STATUS.md "Direction C restyle"). The home page opens on this week at the Temple (pure `core/calendar/week`, a quiet-week notice, a GET body filter, week links, the month view and the feed); a body page opens on its next stated meeting as a date tile in its colour; calendars, news, officers, the contact form and the newsletter archive restyled; the email theme carries each body's colour as its section's bar. Colours come from the bodies' new `colour` field (T4.16) through `data-colour`. Clock-bound pages now expire at the sooner of fifteen minutes and local midnight (`clockBound`, unit-tested across DST nights). axe: 0 violations on 21 public routes in light and dark, a newsletter issue's page and its email, a seeded busy week, and both plugin admin pages. `tests/unit/styles/contrast.test.ts` checks every colour pair in the stylesheets against AA. Screenshots in `docs/design/direction-c/built/`. Clean-copy run of 690fd54, rebased on M7 (f0fc275), on a fresh database (`git archive`, `pnpm install --frozen-lockfile`): `astro check` 0 errors, lint and format clean, 2856 unit tests in 54 files, build complete, `check-dist`, `check-runtime-env` and `check-cache-headers` (13 of 13) pass, 109 e2e passed with `CI=true` (21 public with M7's SEO checks, 23 a11y, 3 visual, 5 monitor and the M3 and M5 suites).
- [ ] **T4.13 [AGENT] Lighthouse ≥ 90 (Performance, Accessibility, Best Practices, SEO).** Out of M4's functional half; carried to M7 with the P95 budget.
  Deps: T4.12, T0.16. Verify: Lighthouse CI on staging.
  Agent part done, staging waits on T0.16: M7's `tests/perf/lighthouse.mjs` (Lighthouse 13.6.0, mobile, three runs a page) on the production build of 690fd54 under `wrangler dev` scores a median and lowest of 100 in all four categories on `/`, `/bodies/blue-lodge`, `/calendar` and `/news`, Best Practices included now that the site has a favicon (T7.11's baseline was 96). Not measured locally: D1's network round trips, edge compression and the Turnstile script, whose host this sandbox cannot reach.
- [ ] **T4.16 [PATH_ASK] Direction C's schema and font.** `seed/seed.json`: an optional `colour` select on `bodies` (Blue, Red, Purple, Slate, Green, Brown), each seeded body given its type's colour. `astro.config.mjs`: Atkinson Hyperlegible Next through the local font provider from a committed file, replacing Inter; JetBrains Mono removed.
  Verify: `tests/unit/seed.test.ts` "body colours"; the e2e FR-4.4 colour check; the human approves the PR.
  Agent part done, awaiting approval.
- [ ] **T4.14 [AGENT] Close M4.** Exit check: the e2e above green in CI, axe clean, Lighthouse ≥ 90 on staging; task-critic PASS; update STATUS.md.
  Deps: all of M4. Verify: critic returns PASS.

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
- [ ] **T5.13 [PATH_ASK] `astro.config.mjs`.** The `newsletter` native plugin descriptor; `RESEND_FROM` and `RESEND_FAKE` in the env schema; after the fix round (T5.22), `RESEND_FROM`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID` and `NEWSLETTER_TEST_ALLOWLIST` are `access: "secret"` so the Worker reads them at runtime.
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

### M5 fix round
An independent verifier failed 6d49955 on one blocking item (B1) and five findings (N1, N2, N4, N5, N6). Each fix below has a test that failed before it, or a recorded check where the item was a question. Evidence was run in a clean copy outside the worktree (`git archive`, `pnpm install --frozen-lockfile`, its own portless name) on 2026-11-23. Design: [ADR-003](../../adr/ADR-003-newsletter-plugin.md) § Decision and § Consequences.

- [x] **T5.21 [AGENT] B1: anonymous visitors read the archive (FR-6.8).** For an anonymous public page EmDash's middleware sets no `locals.emdash.db`, so the archive read nothing and every issue page returned 404 for visitors. The plugin now declares two public, read-only `GET` routes, `archive/list` and `archive/issue`, that return only sent issues (slug, subject, date, and for one issue its sent HTML). The pages call them in-process through `getPublicPluginApiRouteHandler` from `emdash/plugin-utils`. A failed read throws instead of showing an empty archive.
  Verify: `tests/e2e/newsletter-archive.anon.spec.ts` (project `newsletter-archive`, no cookies, after the builder suite approves an issue); `service.test.ts` "the public archive"; `plugin.test.ts`; `route-table.test.ts`.
  Evidence: before, the anonymous test failed on `getByTestId('newsletter-archive')` not found (both attempts). After, it passes; an anonymous curl of `/newsletters` lists the sent issues, an issue page returns 200 with the sandboxed frame and the signup footer, `/newsletters/no-such-issue` returns 404, and a `POST` to `archive/list` returns 405.
- [x] **T5.22 [AGENT] N1: newsletter settings are read at runtime.** `RESEND_FROM`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID` and `NEWSLETTER_TEST_ALLOWLIST` move from `server`/`public` (inlined by the build) to `server`/`secret`, which `astro:env` reads from the Worker env at runtime. `env.staging.vars` and `env.production.vars` in `wrangler.jsonc` declare them empty; `worker-configuration.d.ts` regenerated with `--strict-vars=false`. `TURNSTILE_SITE_KEY` stays a client field, inlined, and the runbook says each environment's build must be given its key. PATH_ASK: `astro.config.mjs`.
  Verify: `node tests/build/check-runtime-env.mjs` (in CI after check-dist); `wrangler-envs.test.ts`.
  Evidence: before, the four sentinels were found in `server/chunks/middleware_*.mjs`. After, none is found and the `TURNSTILE_SITE_KEY` control sentinel is (1 file).
- [x] **T5.23 [AGENT] N2: a globally unsubscribed address is never re-subscribed.** `upsertContact` returns `previously-unsubscribed` without touching Resend when the contact is `unsubscribed`; the form says "This address unsubscribed from the Temple's email before, so it was not added." and how to opt back in. The dev fake records global unsubscribes, and a dev-only Admin route `dev/unsubscribe` sets one.
  Verify: `resend-mailer.test.ts` (only the `GET` is sent), `subscribe.test.ts`, `subscribe.spec.ts` "an address that unsubscribed from all email".
- [x] **T5.24 [AGENT] N4: the email transport registers on Workers.** No change needed. EmDash calls `createPlugin()` lazily during the first request of an isolate, after `@astrojs/cloudflare` has bound `astro:env` to the Worker env.
  Verify: the production build under `wrangler dev` with a dummy `RESEND_API_KEY` in `.dev.vars` and a temporary log in the run copy only.
  Evidence: with the key, `registersEmailTransport=true`, called from `plugins < getPlugins < buildDependencies < initWithLock`; without it, `false`. No email was sent.
- [x] **T5.25 [AGENT] N5, N6: check-dist scans source maps; stale path fixed.** `.map` files are scanned for keys, the fake and the SDK fingerprints (the dev-route check stays on code, since a map embeds `routes.ts`'s own DEV branch). `dev-fakes.ts` names `tests/build/check-dist.mjs`.
  Verify: `node tests/build/check-dist.mjs`.
  Evidence: 612 of 1390 scanned files are maps; a marker planted in one map fails the fake check; removed, it passes.

### Human and close-out
- [ ] **T5.16 [HUMAN] Resend and Turnstile on staging.** Verify the sending domain; create the `subscribers` Segment (and a staging-only test Segment), the newsletter Topic and one Topic per body (default opt-out), and save each body Topic's id on the body; set the secrets `RESEND_API_KEY` and `TURNSTILE_SECRET`, fill `RESEND_FROM`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID`, `NEWSLETTER_TEST_ALLOWLIST` and `TURNSTILE_SITE_KEY` (read at runtime since T4.15) in `env.staging.vars`.
  Deps: T0.16. Verify: the runbook's "Before the first send" table is complete on staging.
- [ ] **T5.17 [HUMAN] Staging send test (PLAN M5 exit check).** A test send reaches the allowlisted inbox; an approved Broadcast to the staging-only Segment is received with a working unsubscribe link; an EmDash invite arrives by email (FR-8.1); a signup appears in Resend with its Topics. Note whether Resend honoured `Idempotency-Key` on the Broadcast and how it answered adding an existing contact to the Segment.
  Deps: T5.16. Verify: the runbook passes end to end on staging.
- [ ] **T5.18 [HUMAN] Checkly HeartbeatMonitor for scheduled sends.** Now T7.7: the monitor is code (`checkly/scheduler.check.ts`) and the Worker pings it; the human creates the account and sets the secret.
  Deps: T5.17. Verify: the heartbeat goes green after a scheduled staging send.
- [ ] **T5.19 [AGENT] Close M5.** Exit check: CI green on both legs; task-critic PASS; update STATUS.md.
  Deps: all of M5. Verify: critic returns PASS.

---

## M4 verification fixes
An independent verifier of the M4 functional half reported one blocking item (B1) and six findings (N1 to N6). Each fix has a test that failed before it, or a mutation that makes the test fail, recorded below. Evidence was run on a clean copy of the committed tree (`git archive` into `/tmp/m7run`, `pnpm install --frozen-lockfile`, its own portless name, a fresh database) on 2026-11-24. Pushed at fcebf83.

- [x] **TV.1 [AGENT] B1: every entry page has a title and a meta description.** Body pages rendered "— Findlay Masonic Temple" with no description, because `getSeoMeta` reads `data.title` and `data.excerpt` and a body has `name` and `description`; news items and pages had no description either. `pageSeo` (`src/lib/adapters/site/seo.ts`) passes each page's own title and an excerpt of its text as the defaults; the SEO panel still wins.
  Verify: `tests/e2e/public/seo.spec.ts` visits home, the bodies list, all six body pages, a body's news, a news item, the news list, both calendars, About, Scholarships, Contact, the newsletter archive and an archived issue as a visitor; `tests/unit/adapters/site/seo.test.ts`.
  Evidence: with the fix reverted in the run copy, the e2e failed with 21 problems (six body titles "— Findlay Masonic Temple" shared by all six, no description on the bodies, the three pages and the news item). With it, green.
- [x] **TV.2 [AGENT] N1: outside production, email reaches only the allowlist.** `gateOutbound` (`src/lib/adapters/send-gate.ts`) wraps the real Resend mailer's `sendEmail`, which every single email goes through: EmDash's `email:deliver` (invites, sign-in links, contact messages) and newsletter test sends. Unless `SITE_ENV` is exactly `production`, an email with any to or cc address outside `NEWSLETTER_TEST_ALLOWLIST` and `@resend.dev` is refused whole. `SITE_ENV` is a runtime `astro:env` field (PATH_ASK) set in each environment's `vars`; unset fails closed.
  Verify: `tests/unit/plugins/newsletter/send-gate.test.ts` through the plugin's real runtime and transport with Resend's HTTP API stubbed; `wrangler-envs.test.ts`; `check-runtime-env.mjs` lists `SITE_ENV`.
  Evidence: 10 tests green. With the gate made a pass-through, 6 fail (unset, `staging`, `prod`, `Production`, a cc off the list, the staging test send).
- [x] **TV.3 [AGENT] N2: a body-wide contact cap, and IPv6 counted by /64.** `kvRateLimiter` (`src/plugins/newsletter/rate-limit.ts`) counts five an hour per network and body, then thirty an hour per body from everyone; the network is an IPv6 /64, an IPv4 address, or the IPv4 inside a mapped address. The sender's count goes first, so one flooding network does not use up the body's allowance.
  Verify: `tests/unit/plugins/newsletter/rate-limit.test.ts`.
  Evidence: 23 tests green. With the body cap skipped and IPv6 counted per address, 11 fail.
- [x] **TV.4 [AGENT] N3, N4: the news sitemap lists canonical pages, and none of an unpublished body.** EmDash injects its sitemap routes only when the site defines none, so `src/pages/sitemap-[collection].xml.ts` answers with EmDash's own handler and, for news, moves each URL from the `/news/<slug>` redirect to `/bodies/<body>/news/<slug>`, dropping items whose body is not published. The search API has no hook or filter: news of an unpublished body still appears in `/_emdash/api/search` (ADR-002 residual risk 10).
  Verify: `tests/unit/adapters/site/sitemap.test.ts`; `seo.spec.ts` "the sitemap lists news at its body's page" (creates an unpublished body with a published news item, then trashes both).
  Evidence: without the route file, the e2e failed: every `<loc>` was `/news/<slug>`, the hidden body's item included. With it, green, and `robots.txt` names the sitemap.
- [x] **TV.5 [AGENT] N5: the sender's name cannot pose as an address or reorder the email.** `<`, `>`, format characters (bidi controls among them) are stripped and line and paragraph separators become spaces; the name left the subject and is quoted in the body.
  Verify: `tests/unit/plugins/newsletter/contact-name.test.ts` (loads against the old module too).
  Evidence: against the old contact module, 7 of 7 fail (U+202E and U+2028 passed, the name was in the subject); green after.
- [x] **TV.6 [AGENT] N6: the contact e2e no longer skips its assertions.** A dev-only Admin route, `dev/rate-limits`, clears the form counters (classified in `PLUGIN_ROUTES`; `check-dist.mjs` fails a build that contains it); `contact.spec.ts` starts each test from empty counters, and the flood test expects exactly five sends and a refusal.
  Verify: `CI=true pnpm e2e --project public -g Q12 --repeat-each 3 --workers 1` on a database earlier runs used.
  Evidence: before, 7 skipped; after, 18 passed and only the setup project's pre-existing stub skipped.

## Direction C fixes
An independent verification of 6798ffe with realistic content failed direction C on layout (STATUS.md "Direction C fixes"). TC.1 came first and failed on 6798ffe; each fix after it turned some of its failures green. Evidence was run on a clean copy (`git archive` into `/tmp/cfixrun`, `pnpm install --frozen-lockfile`, its own portless name, a fresh database) on 2026-11-24. After the rebase onto the M7 review fixes (a752033), a second clean copy of 58718d3 passed the same way: 2915 unit tests, 155 e2e with `CI=true` (44 visual), axe 0 violations, `check-cache-headers` 15 of 15.

- [x] **TC.1 [AGENT] The visual project checks layout on realistic content.** Seeds the bodies' full names, a 60-character title, a 45-letter word, seven entries on one day, and a wide and a tall emblem; checks 37 public pages at 320, 390, 768, 1024 and 1280 px for sideways scrolling, every week-strip and month-grid entry and its body's name inside its day (also at 761 and 1001 px), one emblem slot with names in line, and the search field's 2px outline. The a11y and visual projects share `tests/e2e/public/routes.ts`.
  Verify: `pnpm e2e --project visual`.
  Evidence: on 6798ffe with only the new tests, 21 failed and 129 passed: 17 routes scrolled sideways (home and `/calendar` by 23 px at 320 on "Add the Temple calendar to my phone"; the Eastern Star news item by 131 px at 390 and 201 px at 320 on its name; the Commandery and Eastern Star body pages on their arrow links), entries left their day by up to 58 px on both calendars, emblems had more than one size and names two indents, and the search field's outline was transparent.
- [x] **TC.2 [AGENT] Entries, labels, buttons and titles wrap inside their boxes (a, D1 to D4).** `minmax(0, 1fr)` tracks on day cards, entry lists and entries; no `nowrap` on the body label, `.btn` or `.arrow-link`; `.section-head` wraps; headings break long words (`overflow-wrap: anywhere`); entries pad 8 px a side and hyphenate.
  Verify: TC.1's sideways and spill checks.
  Evidence: all pass; before and after at `docs/design/direction-c/built/fix-{week,month}-1024-*.png` and `fix-news-item-320-*.png`.
- [x] **TC.3 [AGENT] One emblem slot.** 64 by 48 px (48 by 48 at 400 px and under), `object-fit: contain`; names in line once any body has an emblem, except at 360 px and under; the body page's emblem in a square slot.
  Verify: TC.1's emblem check (one box size at every width, one indent above 320 px).
  Evidence: passes with the wide, tall and 1 px emblems seeded.
- [x] **TC.4 [AGENT] The search field's focus ring.** The 2px ink outline every other control has.
  Verify: TC.1's focus check. Evidence: passes; it read `rgba(0, 0, 0, 0)` on 6798ffe.
- [x] **TC.5 [AGENT] One link per notice card.** The body's name is a label; the title is the card's link.
  Verify: the news and a11y suites. Evidence: pass.
- [x] **TC.6 [AGENT] Drawn arrows (D6).** The face has no U+2190 or U+2192 in the latin file or the full variable font, so a subset cannot add them; an SVG mask in the text colour, with `forced-color-adjust: none`.
  Verify: screenshots. Evidence: `docs/design/direction-c/built/home-1280.png` and the week, month and page links.
- [x] **TC.7 [AGENT] A dark Slate that reads as a colour (D5).** `#7ab8d6` for `#cbd5e1`.
  Verify: `tests/unit/styles/contrast.test.ts`. Evidence: 6 of 6 pass (tile 9.10, against the surface 8.47, time on tint 5.95); with `#3a4a5a` it fails 2 tests.
- [x] **TC.8 [AGENT] Comments and STATUS.** Comments that narrated the design choice removed from `astro.config.mjs` (PATH_ASK), `playwright.config.ts` and the home page; the list of differences from the mockup counted (eleven).
  Verify: review. Evidence: lint and format clean.

## M7 — Observability and hardening
Design: logs as typed events (`src/lib/adapters/log.ts`), checks as code (`checkly.config.ts`), caching opt-in per route with a central opt-out for anything personal. Evidence was run as above on 2026-11-24. Human steps: [monitoring-setup.md](../../runbooks/monitoring-setup.md) and [deploy.md](../../runbooks/deploy.md).

### Observability
- [x] **T7.1 [AGENT] JSON-line logger.** One object per line at the event's level; fields named by the event type and primitives only; every string scrubbed of email addresses and token-shaped runs. Logged: `body_access.refused` (`BODY_ACCESS_DENIED`, `INVALID_SLUG`, `SAVE_REJECTED`), `body_access.lookup_failed`, `newsletter.test_sent`, `.approved`, `.refused`, `form.submitted`, `form.rate_limited`, `email.blocked`, `email.failed`, `heartbeat.failed`. `guardRequest` returns a `Refusal` the middleware logs and answers.
  Verify: `tests/unit/adapters/log.test.ts` drives the transport and the send gate with recipient addresses, a message body and Resend-, Turnstile- and token-shaped values (assembled at run time).
  Evidence: 5 tests green; with `scrub` made a no-op, 2 fail.
- [x] **T7.2 [AGENT] Axiom queries.** `docs/observability/axiom.md`: the event table, errors, denials and rejections, `SAVE_REJECTED` with reasons, failed lookups, forms and email, newsletter sends, P95 server time from trace root spans, D1 time.
  Verify: the document. Field names are checked against the first day of data (runbook step 1.5).
- [ ] **T7.3 [HUMAN] Axiom datasets, token, Cloudflare OTLP destinations, dashboard and alerts.** [monitoring-setup.md](../../runbooks/monitoring-setup.md) § 1.
  Deps: T0.12, T8.0. Verify: the "Site events, parsed" query returns rows on staging.

### Synthetic monitoring
- [x] **T7.4 [AGENT] `@monitor` checks.** `tests/e2e/monitor/monitor.spec.ts`: home, a body's page, the Temple calendar, the ICS feed, the signup form; read-only. Project `monitor` in `playwright.config.ts`.
  Verify: `CI=true pnpm e2e --grep @monitor` on a fresh database.
  Evidence: 7 passed (the five checks and the two setup sign-ins they depend on).
- [x] **T7.5 [AGENT] Checkly constructs.** `checkly.config.ts` (a Playwright Check Suite on `@monitor`, every ten minutes, two US locations), `checkly/playwright.config.ts` (no dev server, `ENVIRONMENT_URL`), `checkly/scheduler.check.ts` (`HeartbeatMonitor`, hourly, ten minutes' grace). `checkly@10.2.0` pinned: the receipt's 10.3.0 was inside pnpm's one-day release age; receipt amended.
  Verify: `astro check` and lint cover `checkly/`; `pnpm exec checkly --version` reports 10.2.0.
- [x] **T7.6 [AGENT] Scheduler heartbeat.** At the top of the hour `src/worker.ts` pings the Worker secret `CHECKLY_HEARTBEAT_URL` (`src/lib/adapters/heartbeat.ts`). Corrected in the M7 review fixes (TR.2): the first version pinged after EmDash's `createScheduledHandler`, which returns at once and swallows the run's failure, so the ping proved nothing. The Worker now awaits `runScheduledTasks` from `emdash/middleware` and pings only when it returned. Corrected again in round 2 (TS.1): a publish step EmDash treats as non-fatal still let the ping go, so the ping now also waits for a check that no collection holds an entry the run had to publish.
  Verify: `tests/unit/adapters/heartbeat.test.ts`, `tests/unit/worker.test.ts`.
  Evidence: 7 heartbeat tests green: one ping an hour, none for a missing or non-HTTPS URL, a failed ping logged without the URL. The worker tests are under TR.2.
- [ ] **T7.7 [HUMAN] Checkly account, API key, `checkly test` and `checkly deploy`, the heartbeat secret, alert channel.** [monitoring-setup.md](../../runbooks/monitoring-setup.md) § 2. Replaces T5.18.
  Deps: T0.16. Verify: both checks green in Checkly against staging.
- [ ] **T7.8 [HUMAN] 48-hour soak on staging (M7 exit check).** [monitoring-setup.md](../../runbooks/monitoring-setup.md) § 3.
  Deps: T7.3, T7.7. Verify: Checkly green for 48 hours; result link in STATUS.md.

### Caching and performance
- [ ] **T7.9 [PATH_ASK] Route caching.** `astro.config.mjs` `cache: { provider: cacheCloudflare() }`; `cacheRoute` always sets an expiry (content an hour, clock-bound fifteen minutes, the newsletter archive five); `src/middleware.ts` opts out, after the page ran, every response for a signed-in user, a session cookie, a cookie being set or a non-GET, and marks it `private, no-store`.
  Verify: `node tests/build/check-cache-headers.mjs` (in CI after the build); the e2e.
  Agent part done, awaiting approval: 13 of 13 checks pass on the build. Against the build before the change all 13 fail; with the middleware's opt-out removed, the two signed-in checks fail (`public, max-age=900` on `/` for a request with a session).
- [x] **T7.10 [AGENT] P95 before and after, under `wrangler dev`.** `tests/perf/p95.mjs`, 50 requests per route, five alternating runs per side, on copies of the e2e database (STATUS.md § Local P95 server time (M7)).
  Evidence: server P95 3 to 19 ms per route before, 6 to 22 ms after (medians of five runs); the same build with the Workers cache on and off differs by no more than run-to-run noise. Bound by 7 to 10 D1 queries per page; production adds D1's network round trips (estimated, not measured).
- [x] **T7.11 [AGENT] Lighthouse baseline (T4.13).** `tests/perf/lighthouse.mjs` (Lighthouse 13.6.0 through `pnpm dlx`) on `/`, `/bodies/blue-lodge`, `/calendar`, `/news`, three runs each, production build under `wrangler dev`.
  Evidence: Performance 100, Accessibility 100, Best Practices 96, SEO 100 on all four (median and minimum). The only deduction is `/favicon.ico` 404, a design asset. The restyle (T4.12) must re-run it, on staging too (T4.13's original verify).

### Hardening (parked items)
- [x] **T7.12 [AGENT] a: a failed guard lookup says so.** It and a request that names no entry no longer read "Only a Temple administrator can".
  Verify: `request-guard.test.ts`.
  Evidence: the new assertions fail against the old guard (3 tests), pass after.
- [x] **T7.13 [AGENT] b: a missing draft says to discard it.** Middleware and save hook say "Choose Discard changes on the entry", for an Admin too.
  Verify: `hooks.test.ts`, `request-guard.test.ts`.
  Evidence: 2 hook tests and 1 guard test fail against the old code.
- [x] **T7.14 [AGENT] c: signup rate limit.** Same limiter: five an hour per network, sixty in total; `dev/rate-limits` clears both forms.
  Verify: `subscribe.test.ts`; `subscribe.spec.ts`.
  Evidence: 2 tests fail against the old route (no limit), green after.
- [x] **T7.15 [AGENT] d: id-shaped slugs staged by a co-editing room.** The brief's premise did not hold: a room checkpoint saves through `saveContent`, and EmDash runs `content:beforeSave` on the data alone, staging the slug as `_slug` after the hooks (`emdash-runtime.ts` `handleContentUpdate`). The ban sits where the staged slug goes live: `beforePublish` and `beforeSchedule` refuse an editor's draft whose staged slug looks like an entry id.
  Verify: `hooks.test.ts` "a staged slug shaped like an entry id".
  Evidence: 2 tests fail against the old hooks; an Admin's publish and an unpublish still pass.
- [x] **T7.16 [AGENT] e: other parked items.** None found in STATUS.md or TASK.md beyond a to d; the contact form's limit text no longer blames the visitor, and both forms' messages are checked against their outcome types (`satisfies`).

### Runbooks and close-out
- [x] **T7.17 [AGENT] Runbooks.** New: `grant-changes.md`, `incident.md` (logs, `wrangler tail`, `wrangler rollback`, stopping newsletter sends, contacts), `deploy.md` (gates, staging and production), `monitoring-setup.md`. Updated: `newsletter-send.md` (`SITE_ENV`, signup limit), `onboard-body-editor.md` (staging invites, new messages).
  Verify: every command named was checked against the installed tool (`wrangler rollback --help`, `wrangler tail --help`).
- [ ] **T7.18 [AGENT] Adversarial review of body-access and the newsletter routes (PLAN M7).** Not run in this pass.
  Verify: the code-devil review has no open Critical or High finding.
- [ ] **T7.19 [AGENT] Close M7.** Exit check: T7.8 green, T7.18 clean; task-critic PASS; update STATUS.md.
  Deps: all of M7.

### M7 review fixes
An independent adversarial review of f0fc275 failed M7 on two blocking items (B1, B2) and raised M1, L1 to L8 and S1 to S4. Each fix below has a test that failed before it; the failing and passing output is in the hand-off report. Run on a clean copy of the committed tree (`git archive` into `/tmp/m7fixrun`, `pnpm install --frozen-lockfile`) on 2026-11-24. L6 (the "previously unsubscribed" message) stays as it is, by the operator's decision.

- [x] **TR.1 [AGENT] B1: outside production, signups and Broadcasts reach only the allowlist.** `gateOutbound` wrapped only `sendEmail`, so on staging a stranger who signed up joined the Segment and would get the next staging Broadcast. It now refuses a signup for an address off `NEWSLETTER_TEST_ALLOWLIST` and `@resend.dev` before Resend hears of it (outcome `test-site`, with a plain message), and refuses to create or send a Broadcast unless every contact in its Segment is on the list. The Segment is read through two new mailer port methods (`segmentContacts`, `broadcastSegment`), every page, and a Segment or Broadcast that cannot be read refuses. A refusal is a `blocked` mailer error: the approval answers `mail-blocked` and the issue stays a tested draft.
  Verify: `tests/unit/plugins/newsletter/send-gate.test.ts` (through the plugin's real runtime with Resend's HTTP API stubbed), `service.test.ts`, `log.test.ts`.
  Evidence: against the old gate, 4 of 19 failed (a stranger's signup reached `GET /contacts`; a Broadcast was created and sent to a Segment holding a stranger, and when the Segment could not be read). Green after, 2867 unit tests in all.
- [x] **TR.2 [AGENT] B2: the heartbeat follows the scheduled run, not its start.** `src/worker.ts` awaits `runScheduledTasks` from `emdash/middleware` (the export EmDash documents for a Worker's `scheduled()`), with the cache purge and publish window EmDash's own handler passes, and pings only if it returned; a run that throws logs `scheduler.failed` and rethrows, so Cloudflare records the cron run as failed. The heartbeat therefore proves the cron fired, EmDash started against D1 and finished its pass. It cannot prove each step inside the pass: EmDash catches a failed publish sweep, logs `[scheduled-publish] …` and returns normally, so `docs/observability/axiom.md` alerts on those lines.
  Verify: `tests/unit/worker.test.ts` (the real `src/worker.ts` with EmDash's runner replaced); a production build under `wrangler dev`.
  Evidence: against the old worker, 2 of 3 failed (a ping although the run rejected; the ping before the run finished). Under `wrangler dev` with the D1 binding removed, the old build answered the cron `outcome ok` and still pinged; this one answers `outcome exception`, logs `scheduler.failed` and sends no ping. On the e2e database, a news item scheduled 12 seconds ahead was published inside the awaited run (12 s), and the ping followed it.
- [x] **TR.3 [AGENT] M1: the signup form never reverses a contact's opt-out.** `upsertContact` opted an existing contact in to every ticked Topic, so anyone could re-subscribe someone else to Topics they had left. It now reads the contact's Topic list first (every page; if it cannot, nothing changes), answers `previously-unsubscribed` and changes nothing for a contact that opted out of the newsletter Topic, and opts in only the ticked Topics the contact has not opted out of. A new contact still gets the newsletter Topic and the ticked body Topics. The port's `ContactSignup` names the newsletter Topic apart from the body Topics.
  Verify: `tests/unit/adapters/resend-mailer.test.ts` against a stubbed Resend HTTP API.
  Evidence: the old adapter, given an existing contact opted out of the Lodge Topic, sent `PATCH /contacts/…/topics` with `{"id":"topic-lodge","subscription":"opt_in"}` (a one-off probe in the old input shape). Green after: 12 mailer tests, 291 in the adapters and newsletter suites.
- [x] **TR.4 [AGENT] L3: a form status that names no outcome shows nothing.** Both forms looked their message up in a plain object, so `?subscribe=constructor` or `__proto__` rendered something every object inherits. `ownEntry` (`src/lib/core/lookup.ts`) reads only a table's own keys. A grep of `src` for tables indexed by request input found only these two; the route table is a `Map`, and the other lookups take typed keys.
  Verify: `tests/unit/core/lookup.test.ts`; `tests/e2e/public/pages.spec.ts` "a form status of …".
  Evidence: against the old components the three e2e cases failed (a message rendered for each); green after.
- [x] **TR.5 [AGENT] L4: each recipient is exactly one address.** The gate's Resend-test check matched the end of a string, so `"victim@example.com,delivered@resend.dev"` passed, and `parseRecipients` only trimmed. `parseAddress` (`src/lib/core/address.ts`) accepts one bare address and nothing that separates, quotes or names another; the gate counts anything else as off the list, `parseRecipients` drops the row, and `parseAllowlist` uses the same rule.
  Verify: `send-gate.test.ts` (L4 cases), `views.test.ts` "keeps only rows that hold exactly one address".
  Evidence: 3 failed against the old code (the smuggled pair was sent on staging); 2890 unit tests green after.
- [x] **TR.6 [AGENT] L1: a request with credentials, or a response that sets a cookie, is never shared.** A bearer request got `public, max-age=900` and a `Set-Cookie` (EmDash's D1 session bookmark, added by EmDash's middleware after ours returned). Cloudflare's Workers cache bypasses a response with `Set-Cookie`, but it stores the answer to a request with `Authorization` when the response says `public` (developers.cloudflare.com/workers/cache/configuration, "Automatic bypass conditions"). The middleware now treats `authorization` as personal, and `src/worker.ts` checks the finished response (`forSharedCache`): one that sets a cookie or answers a request with credentials leaves the Worker as `no-store` and `private, no-store`, whatever the route asked for.
  Verify: `node tests/build/check-cache-headers.mjs` (two bearer checks, and every response that sets a cookie must be private); `tests/unit/worker.test.ts` "what Cloudflare's cache may store".
  Evidence: against the old build the two bearer checks failed (`public, max-age=900` and `3600` with `set-cookie`); 15 of 15 pass after. The worker tests failed 2 of 3 against the old Worker.
- [x] **TR.7 [AGENT] L7: a Turnstile token must come from this site's form.** siteverify's `hostname` and `action` were not checked, so a token solved on any site using the same widget passed. Each widget now carries `data-action` (`subscribe` or `contact`), and `siteverify` refuses a token whose `hostname` is not one of the form's origins (the request's own and the configured site's) or whose `action` is not that form's (`hostname-mismatch`, `action-mismatch`). Cloudflare's test secret keys answer `example.com` with no action, so they cannot pass on a deployed site (developers.cloudflare.com/turnstile/troubleshooting/testing).
  Verify: `tests/unit/adapters/turnstile.test.ts` "Turnstile tokens are for this site's form"; `subscribe.test.ts` "the Turnstile token comes from this site's signup form".
  Evidence: against the old verifier 4 of 10 failed (each mismatched token passed); 131 tests green in the Turnstile and newsletter suites after.
- [x] **TR.8 [AGENT] L5: past windows' rate-limit counters are deleted.** Plugin KV has no expiry (`KVAccess.set` takes no TTL), and a plugin `cron` schedule is registered only by `plugin:activate`, which EmDash runs once per database for a config plugin, so existing databases would never get one. Instead the first request in a target's new window sweeps the form's namespace: it lists the counters and deletes, by compare-and-delete, those from an earlier window, at most 20 a sweep so the queries fit a Worker's per-invocation D1 limit; a backlog drains over later windows. A failed sweep is logged (`form.sweep_failed`) and never refuses the request. Counting an IPv6 /64 as one network stays; rotating /64s within a /48 is an accepted residual risk (ADR-003).
  Verify: `tests/unit/plugins/newsletter/rate-limit.test.ts` "deletes a past window's counters…", "at most twenty…", "still answers a request whose sweep fails".
  Evidence: against the old limiter the first failed (6 stale counters left where 2 current ones should remain); 124 newsletter tests green after.
- [x] **TR.9 [AGENT] L8: a slug holding `%` reaches its page.** It was a routing decode bug of ours: Astro decodes the path before it matches a route (`validateAndDecodePathname`, repeated until the path stops changing), and every slug page then decoded the parameter again with EmDash's `decodeSlug`, which throws on `pct%zz`, so the page answered 404 for the sitemap's correctly encoded `pct%25zz`. The seven slug routes now read the parameter once through `slugParam` (`src/lib/adapters/site/paths.ts`). A slug whose `%` starts a valid escape (`%41`) is still decoded by Astro before routing and cannot be reached; EmDash's slugify never writes `%`, so only a hand-typed slug meets it (ADR-003 residual risks).
  Verify: `tests/e2e/public/seo.spec.ts` "a news slug with a percent sign is reachable from the sitemap and its list".
  Evidence: before, the sitemap's URL answered 404; after, 200 with the item's title, and its link in the body's news list opens it.
- [x] **TR.10 [AGENT] L2: no email address reaches Workers Logs or Axiom from a console line.** When the transport throws, EmDash logs `[email:deliver] Provider "newsletter" failed to send email to "<to>"` (`emdash-runtime` `EmailPipeline.sendInner`), and other EmDash lines name users. Not throwing is not an option: EmDash's `email:deliver` contract reports failure only by a throw (`deliverResult.error`), so a transport that returned would make a refused invite read "Invite sent" and a refused contact message read "sent". The observability config offers no attribute filtering (`head_sampling_rate` samples, it does not redact). So `src/worker.ts` wraps the console once at start-up (`redactConsoleEmails`, `src/lib/adapters/log.ts`): every string and error argument has its addresses replaced by `[email]`, whoever wrote it. What it cannot reach (an address inside a plain object, or in a URL path) is recorded in ADR-003 and `docs/observability/axiom.md`, with a 30-day Axiom retention.
  Verify: `tests/unit/worker-console.test.ts`; the production build under `wrangler dev`, inviting an address off the allowlist as Admin on a non-production Worker.
  Evidence: the unit tests failed 5 of 6 against the old Worker. Under `wrangler dev`, the old build logged `failed to send email to "invitee-…@example.com"`; this one logs `failed to send email to "[email]"`, and no line names the invitee.
- [x] **TR.11 [PATH_ASK] S4: query strings stay out of the exported logs and traces.** Cloudflare's invocation log for a fetch names its URL, and traces record URLs and query strings (developers.cloudflare.com/observability/traces, FAQ), while EmDash puts preview (`?_preview=`), magic-link, invite and sign-up tokens (`?token=`) in the query string. `wrangler.jsonc` sets `observability.redact_query_string: true` in both environments ("Whether query strings are removed from request URLs in logs and traces", wrangler 4.166's schema), so invocation logs stay on and keep only the path. The staging build's `dist/server/wrangler.json` carries the setting. Awaiting approval: observability settings are PATH_ASK.
  Verify: `tests/unit/wrangler-envs.test.ts` "keeps query strings out of the logs and traces it exports"; on staging, monitoring-setup § 1.5.
  Evidence: the two new cases failed before the change and pass after.
- [x] **TR.12 [PATH_ASK] S1: a failed purge is logged, and pages still expire.** `cache.purge is not a function` is local only. `cache` from `cloudflare:workers` is a proxy onto the invocation's `ctx.cache` and answers `undefined` where there is none (workerd's `cloudflare:workers` module source); Miniflare implements no Workers cache, and wrangler passes the `cache` setting only when it uploads a version. On Cloudflare, `purge` exists for a Worker with the cache on (developers.cloudflare.com/workers/cache/purge). There it can still fail without throwing: a rate-limited purge resolves `success: false`, which Astro's Cloudflare provider discards. `src/lib/adapters/site/cache-provider.ts` is that provider with an `invalidate` that goes through `purgeTags` and logs `cache.purge_failed`; `astro.config.mjs` names it as the cache provider (PATH_ASK, same `cloudflare` name, so the build still turns the Worker cache on), and the scheduled run purges through `purgeTags` too (TR.2). Every cached route sets a max-age (an hour at most), so a failed purge leaves pages at most that stale. deploy.md § Check step 5 verifies purging on staging.
  Verify: `tests/unit/adapters/site/cache-provider.test.ts`, `purge.test.ts`; under `wrangler dev`, a publish and a scheduled publish both log `cache.purge_failed` ("not available here") in place of EmDash's `TypeError`.
  Evidence: the same three provider tests run against Astro's own provider failed one (a refused purge logged nothing); ours pass. Check-cache-headers: 15 of 15 with the new provider.
- [x] **TR.13 [AGENT] S2: a deploy never serves pages naming removed assets.** Cloudflare keys a Worker's cache by version unless `cache.cross_version_cache` is on, so each deploy starts from a cold cache (developers.cloudflare.com/workers/cache/cache-keys), and the built `wrangler.json` has `cache: { enabled: true }` alone. deploy.md's claim stood; it now cites this, and its "purge by hand" step was wrong: zone purges do not reach a Worker's cache, so it says to redeploy. `check-cache-headers.mjs` fails a build that turns `cross_version_cache` on.
  Verify: `node tests/build/check-cache-headers.mjs`.
  Evidence: with `cross_version_cache: true` written into the built config the check fails at once; with the build as made it passes.
- [x] **TR.14 [AGENT] S3: the Checkly commands are the CLI's.** monitoring-setup.md § 2 set `ENVIRONMENT_URL` in the local shell for a run that happens in Checkly's cloud; it now passes it with `checkly test -e ENVIRONMENT_URL=…` (`-e, --env`, "Env vars to be passed to the test run", `checkly test --help` on 10.2.0). `checkly.config.ts` pointed at a missing `docs/runbooks/checkly.md`; it points at monitoring-setup.md § 2.
  Verify: `pnpm exec checkly test --help`.

### M7 review fixes, round 2
An independent verification of a752033 failed TR.2 (B2) and raised four hardening points. Each fix has a test that failed on c4548b2 first; the failing and passing output is in the hand-off report. Run on a clean copy (`git archive` into `/tmp/m7fix2run`, `pnpm install --frozen-lockfile`) on 2026-11-24.

- [x] **TS.1 [AGENT] B2: the heartbeat means nothing is overdue.** EmDash's run catches a failed publish sweep (`runScheduledMaintenanceTick`) and returns `{ published: [] }` when EmDash is not configured, so with a D1 trigger aborting the publish the entry stayed `scheduled` and the ping still went. After the run, at the top of the hour, `nothingOverdue` (`src/lib/adapters/emdash/overdue.ts`) asks every collection, through `withEmDashRuntime`, `schemaRegistry.listCollections()` and EmDash's own due test (`ContentRepository.findReadyToPublish`), for entries due by the run's end, or by the end of its 70-second publish window if it ran longer. Any such entry withholds the ping and logs `scheduler.overdue` (counts only); a check that cannot run withholds it and logs `scheduler.check_failed`. Hook-refused entries: EmDash 1.6 unschedules an entry a hook cancels (`handleScheduledPolicyRejection`), so what stays due is an entry whose publish keeps failing; incident.md § 6 says a human has to act and lists them. ADR-003 risk 4 narrowed.
  Verify: `tests/unit/worker.test.ts` "the heartbeat means nothing is overdue", `heartbeat.test.ts`; the production build under `wrangler dev`.
  Evidence: against the old Worker 4 of the 5 new worker tests failed (a ping with an overdue news entry, with overdue events and pages, with an entry that fell due during the run, and when the check could not run). Under `wrangler dev` with the verifier's D1 trigger, the entry stayed `scheduled`, `scheduler.overdue` was logged with `entries: 1` and no ping was attempted; without the trigger, an entry due 8 seconds ahead was published inside the run and the ping followed. Without a D1 binding the run still answers `outcome exception` with `scheduler.failed`.
- [x] **TS.2 [AGENT] A Broadcast with no Segment id is refused.** Resend's SDK lists every contact in the account when `contacts.list` gets no `segmentId`, and the gate checked only `=== null`, so a Broadcast record that omitted `segment_id`, or held `""`, had the whole account checked in its place. `broadcastSegment` now answers null for a missing or empty id, and the gate refuses null, undefined and `""`.
  Verify: `send-gate.test.ts` "refuses a Broadcast whose Resend record omits segment_id…" and "…has an empty segment_id…".
  Evidence: against the old gate both failed (`GET /contacts`, then the send went); green after, 138 tests in the newsletter and mailer suites.

---

## Carried forward (tasked in full when the milestone starts)
- [ ] **T8.0 [HUMAN] Production resources.** Create the production D1, R2 bucket (`findlay-masonic-media-production`) and KV namespace, and the Axiom dataset with OTLP destinations `axiom-production-logs` / `axiom-production-traces`; paste the IDs into `env.production` in `wrangler.jsonc`. Decide first whether the existing D1 `findlay-masonic-site` becomes production (T0.11).
  Verify: `tests/unit/wrangler-envs.test.ts` compares the real IDs and passes; `pnpm wrangler d1 list` shows the production DB.
