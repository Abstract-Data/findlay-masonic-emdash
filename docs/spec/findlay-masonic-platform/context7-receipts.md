# Context7 Receipts — findlay-masonic-platform
Append-only. Phase 2 (Tooling), 2026-11-23. Versions are npm `latest` as of 2026-11-23 unless pinned by the scaffold.

## Context7 Receipt — emdash 1.6.0 (+ @emdash-cms/cloudflare 1.6.0)
- resolve-library-id result: /websites/emdashcms (primary, High reputation); /emdash-cms/emdash (repo docs, Medium)
- get-library-docs: (1) RBAC: five site-wide roles (Subscriber 10, Contributor 20, Author 30, Editor 40, Admin 50). Ownership matters: Authors act on their own entries, Editors on any entry. There is no per-collection or per-term permission scoping. (2) Plugin hooks: `content:beforeSave` (can reject with SAVE_REJECTED; event carries `actor {id, role}`, `editedBy[]`, `collection`, `id`), `content:beforeDelete` (return false; trash only, so permanent delete bypasses it), `content:beforePublish/Schedule/Unpublish` (`hooks.content-policy:register`), `media:beforeUpload`, `cron`, `email:deliver` (exclusive transport). No taxonomy-term or menu hooks. No read/list filter hook. (3) Native plugins can ship React admin pages and widgets (`adminEntry`) and declare `storage` collections with indexes. (4) Sandboxed plugins need the Workers Paid plan plus a `worker_loaders` LOADER binding, and run with per-invocation limits of 50 ms CPU, 10 subrequests and 30 s wall time. Native plugins run in-process with none of these. (5) Auth: passkeys by default, plus built-in `github()`, `google()` and `microsoft()` providers, `atproto()`, or Cloudflare Access mode. No magic-link provider is documented. (6) Field types: string, text, url, slug, number, integer, boolean, datetime, select, multiSelect, portableText, json, repeater (flat sub-fields only), blocks, image, file, reference (with targetCollection). `indexed` is allowed on scalar, datetime, select and reference fields. (7) `@emdash-cms/plugin-test` provides Vitest for sandboxed plugins (isolated D1 + LOADER).
- Version-sensitive APIs noted: the peer range is astro ≥ 6 and engines node ≥ 22.16. The scaffold pins emdash ^1.5.0, so bump to 1.6.0. Use `ContentSaveRejectedError` (from `emdash`) to reject in host/native mode and the sandbox envelope in sandboxed mode. Hooks need matching manifest capabilities (`content:write` for beforeSave, and so on).

## Context7 Receipt — astro 7.x (scaffold ^7.3.2; latest 7.4.13) + @astrojs/cloudflare ^14 + @astrojs/react ^7
- resolve-library-id result: /withastro/docs (versions v6, v5, v4; no v7 branch); /websites/astro_build_en
- get-library-docs: queried the server output, Cloudflare adapter and bindings via `locals.runtime.env`. The house AGENTS.md (Astro) overlay is the governing reference for islands, `astro:env` and `astro check`.
- Version-sensitive APIs noted: Context7 has no versioned Astro 7 docs, so verify any Astro-7-specific behavior (Vite 8/Rolldown, the Rust compiler, Advanced Routing) against astro.build directly. This is the Phase 1 risk item.

## Context7 Receipt — @react-email/editor 1.8.10 (+ react-email 6.11.16)
- resolve-library-id result: /resend/react-email
- get-library-docs: `EmailEditor` is a standalone embeddable component (TipTap 3 / ProseMirror) with an `EmailEditorRef` exposing `getEmail()`, `getEmailHTML()`, `getEmailText()`, `getJSON()` (TipTap JSON) and `editor`. Use `composeReactEmail({ editor, pretty: false })` from `@react-email/editor/core` for send-ready HTML and text. Custom blocks use `EmailNode.create({ …, renderToReactEmail })`. Theming uses `EmailTheming.configure({ theme })` from `@react-email/editor/plugins`. Import the stylesheet `@react-email/editor/themes/default.css`.
- Version-sensitive APIs noted: peer react ^18 or ^19 (the scaffold has 19.2.4, which fits). It depends on @tiptap/* ^3.32. It is a client-only editor, so mount it in an EmDash React admin page, never in SSR. Store TipTap JSON (`getJSON()`) as the source of truth for re-editing, and HTML only as the send artifact. Released with React Email 6.0 (April 2026), so it is young; pin the exact version.

## Context7 Receipt — resend 6.39.0 (Node SDK)
- resolve-library-id result: /websites/resend (also /llmstxt/resend_llms_txt)
- get-library-docs: `resend.broadcasts.create({ segmentId, from, subject, html, send?, scheduledAt? })` creates a draft, sends now, or schedules. Segments are the recipients, and a Topic labels the content; contacts who opted out of that topic or globally unsubscribed are skipped. `resend.contacts.topics.update({ id|email, topics: [{ id, subscription: 'opt_in'|'opt_out' }] })` sets per-topic preferences. The `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder links to a hosted per-topic preference page. Idempotency keys go up to 256 characters.
- Version-sensitive APIs noted: the parameter is `segmentId` (formerly audiences). Resend's model is one Topic per Broadcast. A single combined newsletter with per-body sections cannot be filtered per recipient by topic inside one broadcast. This is a Phase 3 design input: either one broadcast per body topic or one combined "All bodies" topic.

## Context7 Receipt — rrule-temporal 2.3.0
- resolve-library-id result: /ggaabe/rrule-temporal
- get-library-docs: Parses RFC 5545 RRULE with `DTSTART;TZID=…`. `between(start, end, inc)`, `next()` and `previous()` return occurrences. Wall-clock generation is in the DTSTART zone, with RFC 5545 DST handling (a fold takes the earlier time; a gap is skipped or pushed). It uses native `Temporal` when present and otherwise the bundled `temporal-polyfill/full`.
- Version-sensitive APIs noted: chosen over `rrule` (jkbrzt) 2.8.1, which was last published in November 2023 and whose JS-Date timezone handling is a known weak spot. Watch bundle size, since the full Temporal polyfill lands in the Worker bundle if workerd lacks native Temporal.

## Context7 Receipt — ical-generator 11.1.4
- resolve-library-id result: /sebbo2002/ical-generator
- get-library-docs: `ICalCalendar` → `createEvent({ start, end, timezone, summary, location, description, url, repeating })`. `repeating()` accepts a raw RRULE string, so stored RRULEs pass straight through. A VTIMEZONE block needs a `timezone({ name, generator })` callback; the docs show `timezones-ical-library`. `serve()` was removed in v6, so return `new Response(cal.toString(), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } })` from an Astro endpoint.
- Version-sensitive APIs noted: no `serve()` (v6+). If VTIMEZONE output is required, `timezones-ical-library` is an added dependency that needs its own receipt. It is not selected yet; decide in Phase 3.

## Context7 Receipt — vitest 5.1.1
- resolve-library-id result: /vitest-dev/vitest (versions include v5.0.3)
- get-library-docs: Vitest 5 requires Vite ≥ 6.4 and Node ≥ 22.12. `vite` is now a required peer. `clearMocks` defaults to true. Inline projects inherit the root config. Hoisted `vi.mock` must be at the top level (otherwise it throws). Fake timers now mock `Temporal`, which affects rrule-temporal tests. Artifacts go to `.vitest/`.
- Version-sensitive APIs noted: use the Astro `getViteConfig()` per the overlay. Do not use `bun test`. `@cloudflare/vitest-pool-workers` compatibility with Vitest 5 is unverified; check it before relying on the Workers pool.

## Context7 Receipt — @playwright/test 1.65.1
- resolve-library-id result: /microsoft/playwright
- get-library-docs: `webServer { command, url, reuseExistingServer: !process.env.CI }`. Use a setup project that authenticates once per role and writes `storageState` files, then `test.use({ storageState })` per role. This is needed to test per-body editors (Blue Lodge editor vs Chapter editor vs Admin).
- Version-sensitive APIs noted: `webServer.port` is deprecated; use `url`. Per the JS/TS base, use portless named URLs, not numeric ports.

## Context7 Receipt — oxlint 1.95.0 + oxfmt 0.80.0
- resolve-library-id result: /websites/oxc_rs_guide_usage (also /oxc-project/tsgolint)
- get-library-docs: `oxlint.config.ts` via `defineConfig` (or `.oxlintrc.json`). Type-aware linting via `options.typeAware: true` (tsgolint), with optional `options.typeCheck`. The `typescript` plugin enables `typescript/no-floating-promises` and similar rules.
- Version-sensitive APIs noted: house templates `oxlint.config.ts (JS/TS Base)` and `.oxfmtrc.jsonc (JS/TS Base)` are Stable 1.0.0. Use them rather than hand-rolling.

## Context7 Receipt — prettier-plugin-astro 1.1.2 (named leftover)
- resolve-library-id result: /withastro/prettier-plugin-astro
- get-library-docs: formats `.astro` files, which Oxfmt does not yet cover.
- Version-sensitive APIs noted: scope it to `*.astro` and MDX only, per the JS/TS base and Astro overlay.

## Context7 Receipt — eslint-plugin-astro 3.2.1 (named leftover)
- resolve-library-id result: /ota-meshi/eslint-plugin-astro
- get-library-docs: provides `astro/no-set-html-directive` and `astro/no-unsafe-inline-scripts`.
- Version-sensitive APIs noted: only these two rules, per the overlay. Matters here because newsletter and portable-text rendering may tempt `set:html`.

## Context7 Receipt — checkly 10.3.0 (CLI / constructs)
- resolve-library-id result: /checkly/docs
- get-library-docs: `checkly.config.ts` → `checks.playwrightConfigPath` + `playwrightChecks[{ pwProjects | pwTags, frequency, locations }]` reuses the Playwright e2e suite as production monitors. `HeartbeatMonitor` covers scheduled jobs.
- Version-sensitive APIs noted: Check Suites running more often than every 5 minutes skip a run if the previous one is still in progress.

## No-library items (no receipt applicable)
- Axiom: integrated through Cloudflare Workers Observability OTLP export (`observability.logs/traces.destinations` in wrangler.jsonc pointing to https://api.axiom.co/v1/logs and /v1/traces). Config only, no SDK. Source: developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/axiom.

## M0 install record (2026-11-23, T0.1–T0.9)
Not a Context7 query: what `pnpm add` actually resolved, and where it differs from the receipts above. Source: `pnpm-lock.yaml` and `npm view <pkg> time`.
- emdash 1.6.0, @emdash-cms/cloudflare 1.6.0, astro 7.4.13, @astrojs/cloudflare 14.4.9, wrangler 4.166.0: as receipted.
- @react-email/editor 1.8.10 (exact): as receipted. `pnpm peers check` reports a transitive @tiptap 3.32 vs 3.35 peer mismatch inside the editor's tree; resolve in M5.
- oxlint **1.94.0** and oxfmt **0.79.0**, not 1.95.0 / 0.80.0. Both receipted versions were published 2026-11-23 16:09/16:11 UTC, and `minimumReleaseAge: 1440` in pnpm-workspace.yaml refuses them. Bump after 2026-11-24 16:12 UTC. Type-aware linting adds oxlint-tsgolint 7.0.2008.
- vitest 5.1.1 + @vitest/coverage-v8 5.1.1, @playwright/test 1.65.1, prettier-plugin-astro 1.1.2, eslint-plugin-astro 3.2.1: as receipted. Added prettier 3.10.1, eslint 10.15.0, @typescript-eslint/parser 8.73.0 (eslint-plugin-astro needs it for TS frontmatter), @types/node 22.20.5 (tsconfig already named `node` types).
- portless 0.18.1 (not receipted; vercel-labs/portless). Declares `engines.node >=24`; every 0.15+ release does. Runs on Node 22.23 in M0 verification.
