# Brainstorm Intake — Findlay Masonic Platform
**Spec name:** findlay-masonic-platform
**Output path:** docs/spec/findlay-masonic-platform/
**Date:** 2026-11-23

**Intent:**
Replace https://www.findlaymason.org/ (a dated Weebly/editmysite site) with a multi-body CMS-driven site for the Findlay Masonic Bodies. The current site lists six bodies: Blue Lodge No. 227, Chapter No. 58, Council No. 50, Commandery No. 49, Order of the Eastern Star No. 23, and the Findlay Temple Board. It also has About Freemasonry, Photos, Temple Calendar, Quarterly Newsletters, Scholarships, Contact Us and Email Signup pages. Baseline capabilities:
1. **Body pages.** One page per body with its meeting schedule, officers, and news/updates that the body maintains itself.
2. **Newsletter builder in admin.** Admins compose and style an email newsletter that pulls the latest articles from the site, grouped into one section per body. Preferred editor: Resend's embedded React newsletter editor.
3. **Calendars.** One per body, plus a combined calendar for the whole Temple and all bodies.
4. **Per-body access control.** Editors granted to one body can create and edit only that body's tags, news, events, officers and settings. Example: Blue Lodge editors can only add events to the Blue Lodge calendar, post Blue Lodge news and edit Blue Lodge officers.

These four are a baseline; more scope is expected.

**Fixed constraints:**
- EmDash CMS (`emdash` ^1.5, `@emdash-cms/cloudflare`). Per-body access control must be built inside EmDash's roles/permissions model or as an EmDash plugin.
- Cloudflare Workers runtime with D1 (database) and R2 (media) via `@astrojs/cloudflare`.
- Repo already scaffolded from the EmDash blog template: Astro ^7.3, React 19.2, pnpm 11.9 (`packageManager` field and `pnpm-workspace.yaml`), `output: "server"`.
- NOT locked, so Phase 2 evaluates: the email provider (Resend preferred but not fixed) and the newsletter editor.

**Timeline:** production (months). This is a full replacement of findlaymason.org, including content migration and hardening.
**Greenfield:** yes. The repo is an unmodified EmDash template scaffold (one commit, "source repo import", no custom code).
**If no — retrofit or evergreen:** n/a. There is no `.abstract-data/` directory, and the human chose to treat the scaffold as greenfield, so Phases 1–5 all run.
**BMAD roles:** Solo. John Eakin (Abstract Data) plays PM and Architect; agents play Engineer, QA and DevOps.

**Context artifacts:**
- `docs/site-inventory.md`: inventory of the 2023 Flywheel/Elementor staging build (findlay-masonic.flywheelsites.com). Note that its body numbering ("Council #58") conflicts with the live site (Chapter No. 58, Council No. 50). Treat the live site as authoritative.
- `reference/findlay-masonic/`: local WordPress export of that staging build. It includes the draft "Masonic Body Page Template", which sketches the intended body page with an officer grid.

**Orchestrator notes:**
- The JS/TS Base (ADR-0060) names `docs/specs/{slug}/` (plural) as the intent home, while this skill writes to `docs/spec/{slug}/`. This run follows the skill. Reconcile the path when the draft ADR is promoted.

---

## Decision Log
<!-- Each phase appends its locked decision here after APPROVE. Never edit a prior entry. -->

### Phase 1 — Language (locked 2026-11-23)
**Primary:** TypeScript 5.x (strict). Cloudflare Workers runtime; Node ≥ 22.16 for tooling; package manager pnpm 11.9 (existing `packageManager` field; not Bun).
**Rationale:** The EmDash and Cloudflare locks decide the language. EmDash is a TypeScript/Astro CMS that runs on Workers with D1 and R2. The newsletter-editor direction (the Resend editor and React Email) is React/TS and matches the scaffold's React 19 islands. The JS/TS Base's package-manager detection resolves to pnpm, and Bun-specific APIs can't run on Workers anyway.
**Risk:** (1) Astro 7 is not house-verified. The decision is to stay on Astro 7, recorded as an explicit override, because EmDash's template targets it and `@astrojs/cloudflare` v14 is aligned with it. Astro 6 remains a fallback (EmDash 1.6 peer range: astro ≥ 6). Verify Astro 7 against the overlay before launch. (2) tsconfig must move from `astro/tsconfigs/base` to `astro/tsconfigs/strict`. (3) Context7 versioned Astro docs top out at v6, so note this wherever an answer depends on Astro 7 behavior. EmDash (`/websites/emdashcms`, `/emdash-cms/emdash`) and Resend are indexed. (4) Commit `pnpm-lock.yaml` on first install.
**AGENTS.md base to use:** AGENTS.md (JS/TS Base) + AGENTS.md (Astro) overlay (required). Tests: Vitest via `getViteConfig()`. Gate: `astro check && astro build`.
**Critique pass result:** PASS (self-run). Human: APPROVE.

### Phase 2 — Tooling (locked 2026-11-23)
**Package manager:** pnpm 11.9 (commit `pnpm-lock.yaml`).
**Framework:** Astro 7.x + `@astrojs/cloudflare` 14 + `@astrojs/react` 7 (`output: "server"`); EmDash 1.6.0 (bump from ^1.5). Custom capabilities ship as **native (in-process) EmDash plugins**, not sandboxed. The sandbox needs Workers Paid + LOADER and caps each invocation at 50 ms CPU, 10 subrequests and 30 s, which newsletter assembly and Resend calls can't fit inside. Native plugins get React admin pages and indexed plugin storage.
**Data layer:** EmDash collections (seed.json schema) on D1; R2 media; KV sessions. Per-body ACL grants live in plugin storage. Expected collections: `bodies`, `officers` (or a repeater on bodies), `events` (datetime + RRULE string + body reference), `news` (posts + body reference), `newsletters`.
**Email:** `resend` 6.39 SDK + `@react-email/editor` 1.8.10 embedded in an EmDash React admin page. TipTap JSON is the stored source of truth and `composeReactEmail()` HTML is the send artifact. Delivery via Resend Broadcasts: one subscriber Segment, one Topic per body. The same plugin implements the `email:deliver` transport for EmDash system email.
**Calendar:** `rrule-temporal` 2.3 for recurrence expansion (DST-correct, America/New_York). `ical-generator` 11.1 for ICS feeds, one per body plus one combined. Calendar views are server-rendered `.astro` with no client calendar library.
**Test stack:** Vitest 5.1 (`getViteConfig()`) for pure logic (ACL policy, recurrence, newsletter assembly); Playwright 1.65 with per-role `storageState`.
**Lint/format:** Oxlint 1.95 (type-aware) + Oxfmt 0.80; `prettier-plugin-astro` for `.astro` only; `eslint-plugin-astro` for its two security rules only.
**Deploy:** Cloudflare Workers (`wrangler deploy`) on the **Workers Paid plan**.
**Auth:** Passkeys (default) + EmDash built-in Google and/or Microsoft OAuth providers. No magic-link provider exists.
**Observability:** Workers Logs + OTLP export to Axiom (wrangler config only); Checkly 10.3 Playwright Check Suites + HeartbeatMonitor for scheduled sends.
**Secrets:** 1Password Environments → Wrangler secrets, read via `astro:env` (server/secret).
**Infra-as-code:** Terraform — NO (revisit if separate staging and production environments are added).
**Context7 receipts:** 13 receipts in context7-receipts.md; Axiom is config-only.
**Phase 3 inputs carried forward:** (1) EmDash has no per-term or per-collection RBAC and no read-filter hook. (2) A Resend Broadcast carries a single Topic.
**Critique pass result:** PASS (self-run). Human: APPROVE.

### Phase 3 — Patterns (locked 2026-11-23)
**Primary pattern:** Routing. `body` is the dispatch key for authorization, public pages, calendars, ICS feeds and newsletter sections.
**Composition:** Routing → prompt chaining (newsletter pipeline: gather news since last issue → assemble per-body sections as TipTap JSON → admin edits in EmailEditor → composeReactEmail → test send → **human preview approval** → create/schedule Resend Broadcast → record broadcast id).
**Hexagonal / Ports & Adapters:** YES (lightweight). Pure core in `src/lib/core/` (acl, recurrence, newsletter, ics); adapters in `src/lib/adapters/` (EmDash repo, Resend, clock). Thin native plugins `body-access` and `newsletter`.
**Data model:** `bodies` (name, number, emblem, description, contact, per-body tag vocabulary, resend topic id); `officers` (body, title, name, photo, term, order); `events` (body, start/end America/New_York, optional RRULE + EXDATE json, location, description); `news` (body, tags validated against the body vocabulary, portableText, includeInNewsletter). Every body-scoped entry has a required, indexed `body` reference. The meeting schedule comes from the body's recurring "stated meeting" event.
**Per-body access: Option A, "Editor role + body guard."** Body editors get the EmDash Editor role. The `body-access` guard enforces grants on `content:beforeSave` (actor + all `editedBy`), `content:beforeDelete`, `content:beforePublish/Unpublish/Schedule` and `media:beforeUpload`. It blocks body-field changes to non-granted bodies and auto-assigns `body` on create when the actor holds a single grant. Tags are a per-body vocabulary, not a global EmDash taxonomy. Temple-wide staff get the Admin role. **Accepted residual risks:** (1) body editors can read other bodies' drafts in the admin; (2) body editors can edit site-wide menus, widgets, sections and bylines. Option C (body portal) was rejected for the baseline on cost.
**Newsletter model:** One sectioned "Findlay Masonic Newsletter" Broadcast → `subscribers` Segment under a single newsletter Topic. Per-body Topics are created and captured at signup, reserved for future body-only broadcasts.
**Agent scope:** Reads src/, plugins/, seed/, tests/, docs/, astro.config.mjs, wrangler.jsonc, reference/ (read-only). Writes src/, plugins/, tests/, docs/. Executes pnpm, astro dev|check|build, vitest, playwright (local), oxlint, oxfmt, `wrangler d1 execute --local`. Off-limits/ASK: wrangler deploy, any `--remote` D1 command, Cloudflare account changes; seed/seed.json schema and astro.config.* (human confirm); live Resend broadcasts or sends to non-allowlisted addresses; secret values; editing reference/.
**Design Principles Gates:** Astro Design Principles Gate (A1–A12) on `*.astro`, `src/pages/**/*.ts`, `src/middleware.ts`, `astro.config.*`; TypeScript Design Principles Gate on `src/lib/**` and plugin `.ts/.tsx`. They are never run on the same files.
**Context7 receipts (architecture-level):** none new (covered by the emdash 1.6 receipt).
**ADR draft:** adr/adr-draft-stack-selection.md (Status: Proposed).
**Critique pass result:** PASS (self-run). The Option A requirement gap was surfaced to the human and accepted. Human: APPROVE.
