# project-constitution.md
## Project: Findlay Masonic Platform (replacement for findlaymason.org)
## Created: 2026-11-23
## Source: brainstorm-intake.md decision log (Phases 1–3, all APPROVE-locked)

Source tags: **[I]** = fixed constraint stated at intake · **[B]** = implied by the AGENTS.md base/overlay selected in Phase 1 · **[A]** = required by the Phase 2/3 architecture decisions.

## Stack (immutable)
- Language: TypeScript 5.x, `strict` (tsconfig extends `astro/tsconfigs/strict`)
- Runtime / Package manager: Cloudflare Workers (workerd) at runtime; Node ≥ 22.16 for tooling; pnpm 11.9 with a committed `pnpm-lock.yaml`
- Framework: Astro 7.x (`output: "server"`) + EmDash 1.6 CMS + React 19 (admin islands and plugin admin pages only)
- Data: Cloudflare D1 (EmDash collections + plugin storage), R2 (media), KV (sessions)
- Email: Resend (`resend` SDK) + `@react-email/editor` (pinned exact)
- Calendar: `rrule-temporal` (recurrence) + `ical-generator` (ICS feeds)
- Deploy target: Cloudflare Workers, Paid plan, via `wrangler deploy`
- Observability: Workers Logs + OTLP export to Axiom; Checkly synthetic monitoring

## Non-negotiable constraints

### Platform and stack
- **[I]** 🚫 Never replace EmDash or move off Cloudflare Workers/D1/R2. ✅ Solve gaps inside EmDash: native plugins, hooks, plugin routes and admin pages.
- **[A]** 🚫 Never ship the custom plugins in sandboxed/registry format. ✅ Build `body-access` and `newsletter` as native (in-process) EmDash plugins.
- **[A]** 🚫 Never stay on Astro 7 untested. ✅ Verify Astro 7 behavior against the AGENTS.md (Astro) overlay before launch (recorded override); fall back to Astro 6, which is within the EmDash peer range ≥ 6, if a blocker appears.
- **[B]** 🚫 Never switch package managers or run `bun install`/`npm install`. ✅ Use `pnpm` for every install and script.
- **[B]** 🚫 Never use the base's NodeNext `.js`-extension imports or `bun test`. ✅ Use Vite/bundler extensionless imports with tsconfig path aliases, and Vitest via `getViteConfig()`.
- **[B]** 🚫 Never use Bun- or Node-only APIs in runtime code. ✅ Use Web-standard and Workers APIs, accessing bindings via `locals.runtime.env`.

### Secrets and configuration
- **[B]** 🚫 Never commit, log or hardcode secrets (`RESEND_API_KEY`, OAuth client secrets, Axiom tokens). ✅ Keep them in 1Password Environments, push them with `wrangler secret put`, and read them via `astro:env` fields with `context: 'server', access: 'secret'`.
- **[B]** 🚫 Never declare an `astro:env` field as both `secret` and `client`. ✅ Expose only non-secret values through `access: 'public'`.
- **[B]** 🚫 Never document or hardcode numeric localhost ports. ✅ Wrap `dev` with portless and use the named `.localhost` URL.

### Per-body access control
- **[I]** 🚫 Never let a user create, edit, delete, publish, unpublish, schedule or re-assign a body-scoped entry for a body they are not granted. ✅ Route every such write through the `body-access` guard (`content:beforeSave`, `content:beforeDelete`, `content:beforePublish/Unpublish/Schedule`), which checks the actor's grants.
- **[A]** 🚫 Never authorize a save on `actor` alone. ✅ Check the grants of `actor` **and every user in `editedBy`**, per the EmDash hooks reference.
- **[A]** 🚫 Never add a body-scoped collection without a body key. ✅ Give every body-scoped collection (`officers`, `events`, `news`, and future ones) a required, indexed `body` reference, and have the guard reject saves that lack it.
- **[A]** 🚫 Never model body tags as a global EmDash taxonomy. ✅ Store each body's tag vocabulary on its `bodies` entry and validate `news.tags` against it on save.
- **[A]** 🚫 Never grant body editors Admin. ✅ Give body editors the EmDash **Editor** role plus explicit body grants, and reserve **Admin** for Temple-wide administrators.
- **[A]** 🚫 Never implement the grant policy inside hook or route handlers. ✅ Keep it a pure function in `src/lib/core/acl` with exhaustive Vitest coverage, and keep hooks thin callers.
- **[A]** 🚫 Never claim read isolation or site-structure isolation for body editors. ✅ Document the two **accepted residual risks**: (1) body editors can read other bodies' drafts in the admin; (2) body editors can edit site-wide menus, widgets, sections and bylines. Revisit only via a new ADR (Option C or upstream EmDash scoped permissions).

### Newsletter and email
- **[A]** 🚫 Never import the `resend` SDK or any secret-bearing module into a hydrated island or the React admin bundle. ✅ Call Resend only from `newsletter` plugin routes and the `email:deliver` transport.
- **[A]** 🚫 Never store only rendered HTML for an issue. ✅ Store TipTap JSON (`getJSON()`) as the editable source of truth, and the `composeReactEmail({ pretty: false })` HTML as the send artifact.
- **[A]** 🚫 Never create or send a live Broadcast without an Admin's explicit preview approval. ✅ Require test-send → preview → approve → create/schedule Broadcast, and record the Resend broadcast id on the issue.
- **[A]** 🚫 Never send newsletter email without an unsubscribe path. ✅ Include `{{{RESEND_UNSUBSCRIBE_URL}}}` in every Broadcast footer, and send under the newsletter Topic to the `subscribers` Segment.
- **[A]** 🚫 Never let agents or automated tests send to real subscriber addresses. ✅ Limit non-production sends to an allowlisted admin inbox and Resend test addresses.

### Calendar
- **[A]** 🚫 Never store recurring meetings as free text or as pre-expanded rows. ✅ Store an RRULE string + DTSTART in `America/New_York` + EXDATE exceptions, and expand with `rrule-temporal` in `src/lib/core/recurrence`.
- **[A]** 🚫 Never maintain a body's meeting schedule separately from its calendar. ✅ Derive it from the body's recurring "stated meeting" event, plus an optional note.

### Frontend (Astro)
- **[B]** 🚫 Never use blanket `client:load` or a page-level island. ✅ Render public pages (body pages, calendars, news) as static `.astro` server output, and hydrate only genuinely interactive widgets with `client:visible`/`client:idle`.
- **[B]** 🚫 Never render CMS rich text with `set:html`. ✅ Use EmDash's PortableText rendering. `eslint-plugin-astro` enforces `no-set-html-directive` and `no-unsafe-inline-scripts`.
- **[B]** 🚫 Never put server-only SDKs or D1 access in client components. ✅ Keep server logic in `src/pages/**/*.ts` endpoints, `src/middleware.ts`, `src/lib/` and plugin routes.

### Data integrity and operations
- **[A]** 🚫 Never change `seed/seed.json` collection schemas or `astro.config.*` without human confirmation. ✅ Propose the change in the PR, get approval, then apply it (PATH_ASK).
- **[A]** 🚫 Never run `wrangler deploy` or any `--remote` D1 command as an agent. ✅ Use `wrangler d1 execute --local` and `astro dev`; deploys are human-approved.
- **[A]** 🚫 Never edit `reference/`. ✅ Treat it as a read-only legacy export, used only for content migration and inventory.
- **[B]** Conflict resolution order: Security > Correctness > Data integrity > Performance (measured) > Maintainability > Style.

## Definition of done
- `pnpm astro check` passes with zero errors (`astro check` replaces bare `tsc` for `.astro` files).
- `pnpm astro build` succeeds.
- `pnpm vitest run` passes, including exhaustive `acl` policy tests, DST-boundary recurrence tests (Vitest 5 fake timers also mock `Temporal`) and newsletter-assembly tests.
- `pnpm playwright test` passes, including per-role `storageState` suites proving a body editor cannot write to another body and an Admin can.
- `oxlint` (type-aware) is clean, `oxfmt --check` is clean, and `prettier --check` passes on `*.astro`.
- The Astro Design Principles Gate (A1–A12) passes on touched `*.astro`/`src/pages/**/*.ts`/middleware/config files, and the TypeScript Design Principles Gate passes on touched `src/lib/**` and plugin `.ts/.tsx` files.
- All TASK.md items are checked off, and the task-critic subagent returns PASS before the task is declared complete.

## AGENTS.md base
- Primary: AGENTS.md (JS/TS Base) v1.3.0
- Overlays: AGENTS.md (Astro) overlay (required) and its companions: `tsconfig.json (Astro strict)`, `wrangler.jsonc (Astro on Cloudflare)`, `.prettierrc (Astro)`, `eslint.config.mjs (Astro)` (two-rule leftover), `oxlint.config.ts`/`.oxfmtrc.jsonc (JS/TS Base)`, GitHub Actions CI (Astro)
- Environments: `staging` and `production` Wrangler environments on the Workers Paid plan, each with its own Worker, D1, R2 and KV; local dev via `astro dev`/`wrangler --local` (amendment 1).

## Context7 receipt log
- See `context7-receipts.md` in this folder (13 receipts, Phase 2).

## Amendments
1. **2026-11-23 — PLAN-phase human decisions (plan 0001 §2, ADR-001).** Adds these non-negotiables:
   - 🚫 Never ship a public page or plugin admin page that fails WCAG 2.1 AA. ✅ Zero axe AA violations in e2e.
   - 🚫 Never regress public pages below Lighthouse 90 (Performance, Accessibility, Best Practices, SEO) or cached public pages above P95 300 ms server time. ✅ Lighthouse CI budget; Axiom P95.
   - 🚫 Never share a D1, R2 or KV resource between environments. ✅ Separate `staging` and `production` Wrangler environments; still no Terraform.
