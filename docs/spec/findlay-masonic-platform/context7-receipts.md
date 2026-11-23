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

## Receipt — temporal-polyfill 1.0.8 and timezones-ical-library 3.0.0 (M2, 2026-11-23)
Not a Context7 query: the M2 design probes (rrule-temporal 2.3.0, ical-generator 11.1.4, both libraries below, Node 22.23.5, workerd 1.20261123.1) plus the installed type declarations. Versions are npm `latest`, published 2026-11-04 and 2026-11-08, so `minimumReleaseAge: 1440` accepts them. All four M2 runtime dependencies are pinned exactly (`pnpm add -E`): rrule-temporal 2.3.0, ical-generator 11.1.4, temporal-polyfill 1.0.8, timezones-ical-library 3.0.0. No version deviation.
- **temporal-polyfill 1.0.8.** APIs used: `import { Temporal } from "temporal-polyfill"` (no global install); `Instant`, `ZonedDateTime`, `PlainDateTime`, `PlainDate`, `PlainYearMonth`, `Duration`; `toZonedDateTime`, `toZonedDateTimeISO`, `until({ largestUnit: "days" })`, `add`/`subtract`, `compare`. Evidence: Node 22 has no global `Temporal`, and workerd at compat date 2026-11-01 has none unless the `temporal` flag is set, so core imports the polyfill and passes it to rrule-temporal as its `temporal` option; occurrences come back as polyfill `ZonedDateTime` instances. Its types re-export `temporal-spec` 1.0.1, the same package rrule-temporal types against. Size 56.1 KB min / 19.3 KB gz.
- **timezones-ical-library 3.0.0.** API used: `tzlib_get_ical_block(tzName)`, whose first element is the VTIMEZONE block. Evidence: passed to ical-generator as `calendar.timezone({ name: null, generator })`, it emits one `America/New_York` VTIMEZONE (EDT from 2SU March, EST from 1SU November) and keeps `DTSTAMP` in UTC; the plain `timezone("America/New_York")` form drops the `Z`. The block carries `LAST-MODIFIED:20261108T123740Z`, so a library bump changes the ICS golden file. Size 46.8 KB min / 12.4 KB gz.
- **rrule-temporal 2.3.0 behavior measured in M2** (adds to its receipt above): `strict: true` still accepts unknown parts and out-of-range values (`GARBAGE=1`, `BYMONTHDAY=40`, `COUNT=-3`), so core whitelists parts itself. It rejects ordinal `BYDAY` with DAILY/WEEKLY, `BYMONTHDAY` with WEEKLY, `BYSETPOS` alone, and an `UNTIL` whose value type differs from DTSTART, so core builds the rule from an RFC 5545 `DTSTART` line (`VALUE=DATE` for all-day). It drops a spring-forward-gap occurrence instead of shifting it, so core refuses 02:xx starts. An EXDATE must match the occurrence's exact time. `toText` renders `BYDAY=-2TU` as "last Tuesday", so describeSchedule names every ordinal itself.

## Receipt — resend 6.39.0 (M5, 2026-11-23)
Sources: the installed package (`node_modules/resend/dist/index.d.mts` and `index.mjs`), and Context7 `/websites/resend` (broadcast, contact and idempotency pages). Installed with `pnpm add -E resend@6.39.0`; published 2026-11-18, so `minimumReleaseAge: 1440` accepts it. New lockfile entries: resend, postal-mime 2.7.6, standardwebhooks 1.1.1 (and their two small dependencies). Its peer `@react-email/render` is optional and only renders a `react` payload; the plugin sends HTML.
- **Client.** `new Resend(key)` sends every call through the global `fetch` to `https://api.resend.com` and answers `{ data, error, headers }`; it never throws on an HTTP error. A network failure gives `error.name: "application_error"` with `statusCode: null`. `RESEND_BASE_URL` is read only where `process.env` exists. The adapter treats null, 429 and 5xx as an unknown outcome and other 4xx as a refusal.
- **Broadcasts.** `broadcasts.create({ name?, segmentId, topicId?, from, subject, previewText?, html | text | react, replyTo?, send?: true, scheduledAt? }, requestOptions?)` posts `/broadcasts`. Its request options are `PostOptions` (`headers`, `signal`, `query`) **without** `IdempotentRequest`: unlike `emails.send` and `batch.send`, there is no `idempotencyKey` option, and the Context7 idempotency page covers emails only. R3 is confirmed. The plugin sends `Idempotency-Key` through `requestOptions.headers` anyway and relies on the key-named lookup. `broadcasts.list({ limit <= 100, after })` returns `{ data: [{ id, name, status: "draft" | "queued" | "sent", ... }], has_more }`, newest first. `broadcasts.send(id, { scheduledAt? })` starts an API-created draft.
- **Contacts.** No upsert endpoint. `contacts.get({ email })` answers 404 `not_found` for an unknown address; `contacts.create({ email, segments: [{ id }], topics: [{ id, subscription: "opt_in" | "opt_out" }] })`; `contacts.segments.add({ email, segmentId })` posts `/contacts/{email}/segments/{id}`; `contacts.topics.update({ email, topics })` patches `/contacts/{email}/topics`. The adapter gets, then creates, or adds and updates.
- **Version-sensitive APIs noted.** `segmentId` replaces the deprecated `audienceId`. `{{{RESEND_UNSUBSCRIBE_URL}}}` in Broadcast HTML becomes the recipient's hosted preference page; a test email from `emails.send` keeps the literal placeholder. Whether the broadcast endpoint honours `Idempotency-Key`, and how `contacts.segments.add` answers for a contact already in the Segment, are unverified until the staging send test (STATUS).

## Receipt — @react-email/editor 1.8.10 in M5
Sources: the installed `dist/index.d.mts`, `dist/core`, `dist/plugins` and `dist/extensions`, and a Node probe. Adds to the Phase 2 receipt above.
- **EmailEditor.** Props: `content`, `onUpdate(ref)`, `onReady`, `theme`, `editable`, `extensions`, `className`. An `extensions` list replaces the default `[StarterKit, Placeholder, EmailTheming.configure({ theme })]` entirely, so the caller passes `EmailTheming` itself and `theme` is then unused. The ref exposes `getJSON()` and `editor`.
- **composeReactEmail({ editor, preview?, pretty? })** returns `{ html, text, unformattedHtml }` and needs a TipTap `Editor` (`getJSON`, `extensionManager.extensions`, `schema`); only nodes whose extension is an `EmailNode` are rendered. A Node probe composed an issue headlessly with `new Editor({ extensions, content })`, but `@tiptap/core` is not a direct dependency, and adding it, aliased or not, re-resolved EmDash admin's pinned `@tiptap/*` 3.32 peers in the lockfile. So the admin page composes on save, where the editor already exists, and the server stores and sends that HTML (ADR-003).
- **EmailNode.create({ name, group, content | atom, addAttributes, parseHTML, renderHTML, renderToReactEmail })** defines a block for both the editor and the email. **EmailTheming** (`@react-email/editor/plugins`) takes `{ extends: "basic" | "minimal", styles }`.
- **Container wrap.** StarterKit's `container` node has a plugin that wraps a document lacking one, which is why core's assembled documents keep a `container` root.
- **CSS.** `@react-email/editor/themes/default.css` styles only `[data-re-*]` attributes (bubble menu), so it cannot restyle EmDash's admin.
- **M0 peer note resolved by evidence, not by change.** The editor's list extensions still resolve `@tiptap/core` 3.32 while the editor uses 3.35. The e2e builder test loads, edits and composes an issue through it without error.

## Receipt — Cloudflare Turnstile siteverify (M5, no npm dependency)
Source: Cloudflare documentation through the Cloudflare docs MCP: "Validate the token" (`/turnstile/get-started/server-side-validation/`, updated 2026-11-16) and "Test your Turnstile implementation" (`/turnstile/troubleshooting/testing/`, updated 2026-11-05).
- `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`, form-encoded or JSON: `secret`, `response` (the token), optional `remoteip` and `idempotency_key`. The answer is JSON `{ success, "error-codes", challenge_ts, hostname, action, cdata }`. A token is at most 2048 characters, valid for 300 seconds and single use (`timeout-or-duplicate`).
- The widget writes its token into the form field `cf-turnstile-response`; its script is `https://challenges.cloudflare.com/turnstile/v0/api.js`.
- Test keys: site key `1x00000000000000000000AA` always passes and issues the dummy token `XXXX.DUMMY.TOKEN.XXXX`; secret `1x0000000000000000000000000000000AA` accepts only that token; `2x0000000000000000000000000000000AA` always fails. The dev stand-in verifier copies the always-pass secret's rule offline.

## Receipt — @axe-core/playwright 4.14.0 (M4, 2026-11-23)
Not a Context7 query: the npm registry (`npm view @axe-core/playwright time`, `npm view axe-core time`) and the installed package (`node_modules/@axe-core/playwright/dist/index.d.mts`). Installed with `pnpm add -D -E @axe-core/playwright@4.14.0`, published 2026-10-15, so `minimumReleaseAge: 1440` accepts it. It depends on `axe-core ~4.14.0`, which resolved to 4.14.1 (published 2026-11-16); both are MPL-2.0 and dev-only. Peer `playwright-core >= 1.0.0` is met by @playwright/test 1.65.1.
- **API used.** `new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()`, and `.include(selector)` to scope a plugin admin page to its own container. `analyze()` resolves to `{ violations: [{ id, impact, nodes: [{ target }] }] }`. The package exports `AxeBuilder` both named and as the default; the suite imports it by name (`import/no-named-as-default`).
- **Version-sensitive notes.** The 4.14.1 prereleases (`4.14.1-<sha>`) on the registry are snapshot builds; the exact pin keeps the suite on the 4.14.0 release.
