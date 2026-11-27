# ADR-001: Stack and Architecture Selection — Findlay Masonic Platform

**Status:** Accepted (2026-11-23, with approval of plan 0001)
**Date:** 2026-11-23
**Plan:** [../plans/0001-findlay-masonic-platform/PLAN.md](../plans/0001-findlay-masonic-platform/PLAN.md)

## Context
findlaymason.org is a dated Weebly/editmysite site serving six bodies: Blue Lodge No. 227, Chapter No. 58, Council No. 50, Commandery No. 49, OES No. 23 and the Findlay Temple Board. The replacement must provide: (1) a page per body with its meeting schedule, officers and body-maintained news; (2) an admin newsletter builder that pulls the latest articles grouped into per-body sections, using the React Email editor; (3) per-body and combined calendars; (4) per-body access control, so a body's editors can change only that body's tags, news, events and officers. EmDash on Cloudflare Workers/D1/R2 is a fixed constraint.

Phase 2 surfaced two platform facts that shape this decision:
- **EmDash RBAC is site-wide.** It has five fixed roles and a fixed permission map that plugins cannot extend. There is no per-collection or per-term scope and no read-filter hook. Editors manage taxonomies, menus, bylines, widgets and sections site-wide, with no hooks on those areas.
- **A Resend Broadcast carries one Topic.** A single sectioned newsletter cannot drop sections per recipient according to that recipient's topic preferences.

## Decision
**Stack:** TypeScript 5 (strict) · Astro 7 (`output: "server"`) · EmDash 1.6 · Cloudflare Workers (Paid) + D1 + R2 + KV · pnpm 11.9 · `resend` 6.39 + `@react-email/editor` 1.8 · `rrule-temporal` 2.3 · `ical-generator` 11.1 · Vitest 5 + Playwright 1.65 · Oxlint/Oxfmt · Axiom (OTLP export) + Checkly.

**Primary pattern:** Routing. The `body` key is the dispatch dimension for authorization, public pages, calendars, ICS feeds and newsletter sections. Composed with **prompt chaining** for the newsletter build pipeline (fixed sequence, with a human preview gate before send).

**Structure:** Ports & Adapters, lightweight.
- Pure core in `src/lib/core/`: `acl` (grant policy), `recurrence` (RRULE expansion + exceptions), `newsletter` (issue assembly into TipTap JSON), `ics` (event → ICS mapping).
- Adapters in `src/lib/adapters/`: EmDash content repository, Resend mailer, clock.
- Two native EmDash plugins stay thin, delegating to the core:
  - **`body-access`**: a grants store (user ↔ body), a grants admin page, and guard hooks on `content:beforeSave`, `content:beforeDelete`, `content:beforePublish`, `content:beforeUnpublish`, `content:beforeSchedule` and `media:beforeUpload`. The save guard checks `actor` and every `editedBy` user.
  - **`newsletter`**: a React admin page embedding `EmailEditor`, routes for build / test-send / create-broadcast / subscribe, and the `email:deliver` Resend transport.

**Per-body access model:** Option A, "Editor role + body guard." Body editors receive the EmDash **Editor** role so peers in the same body can edit each other's entries. The `body-access` guard blocks any write, delete, publish-state change or body-field change for an entry whose `body` is not in the actor's grants, and auto-assigns `body` on create when the actor holds a single grant. Body-scoped tags are a per-body vocabulary stored on the `bodies` entry and enforced on save, not a global EmDash taxonomy. Temple-wide administration uses the **Admin** role.

**Accepted residual risks of Option A** (EmDash cannot enforce these):
1. Body editors can *read* other bodies' drafts in the admin.
2. Body editors can edit site-wide menus, widgets, sections, bylines and any global taxonomy. Mitigation: no global taxonomy for body content; structure is reviewed by Admins; and the residual risk is accepted in the constitution.

**Newsletter model:** One sectioned "Findlay Masonic Newsletter" Broadcast to the `subscribers` Segment under a single newsletter Topic. All subscribers get all body sections. Per-body Topics are created and captured at signup, reserved for optional body-specific broadcasts later.

**Calendar model:** Events store a start/end in America/New_York, an optional RRULE string and EXDATE exceptions. A body's meeting schedule is its recurring "stated meeting" event, the single source of truth, plus an optional note. The combined calendar is the union of all bodies' events.

## Consequences
- Write isolation between bodies is enforced server-side for all body-scoped collections and media. Read isolation in the admin, and site-structure isolation, are not.
- Every body-scoped collection must carry a required, indexed `body` reference. A new body-scoped collection without it is a bug the guard must reject.
- The newsletter depends on the young `@react-email/editor`, so pin exact versions. TipTap JSON is the durable artifact.
- Native plugins run in-process with full host access, so the guard is trusted code and must be covered by exhaustive Vitest policy tests and Playwright per-role tests.
- Forecloses sandboxed or registry distribution of these plugins, and the Workers free plan.
- Leaves open: upstream contribution of scoped permissions to EmDash, which would allow moving to Option C-level isolation without a custom portal.

### Alternative considered: Option C, "Body portal"
Body users get the Contributor role, and all body-content CRUD goes through plugin admin pages and routes that enforce grants, with the guard rejecting native-editor writes to body collections. This gives stronger isolation (no menu, widget or taxonomy access), but requires rebuilding rich-text, event and officer editing UIs inside plugin pages. Contributors can still read other bodies' drafts. Rejected for the baseline on cost-to-benefit, and revisit if Option A's residual risks prove unacceptable.

---
> **Promotion status:** Not yet promoted. This draft becomes part of the project's ADR log only if this spec proceeds — see SKILL.md § "ADR lifecycle: draft → promoted."
