# PLAN — Findlay Masonic Platform
**Plan:** 0001-findlay-masonic-platform
**SDD phase:** 3 (TASKS) — plan approved by human 2026-11-23
**Date:** 2026-11-23
**Spec:** [../../spec/findlay-masonic-platform/spec.md](../../spec/findlay-masonic-platform/spec.md) (v0.2.0)
**Constitution:** [../../spec/findlay-masonic-platform/project-constitution.md](../../spec/findlay-masonic-platform/project-constitution.md)
**ADR:** [../../adr/ADR-001-stack-selection.md](../../adr/ADR-001-stack-selection.md) (Accepted 2026-11-23 on plan approval)
**Tasks:** [TASK.md](TASK.md) (M0, M1)

## 1. Approach
The work is sequenced into nine milestones. Each ends in a state a reviewer can verify by running something. Milestones run in order; work inside a milestone may run in parallel. Dependencies flow strictly downward: foundation → content model → pure core → access → public site → newsletter → migration → hardening → launch.

The pure core (`src/lib/core/`) is built and exhaustively tested **before** any plugin or page uses it, so every policy, recurrence or assembly bug is caught in a Vitest run, not through the admin UI.

## 2. Resolved planning decisions (2026-11-23)
| # | Spec open question | Decision | Source |
|---|---|---|---|
| Q1, Q2 | Performance / accessibility | **WCAG 2.1 AA** on all public pages and plugin admin pages; **Lighthouse ≥ 90** (Performance, Accessibility, Best Practices, SEO) on public pages; **P95 server time < 300 ms** on cached public pages | Human |
| Q3 | Staging | **Yes**: Wrangler named environments `staging` and `production`, each with its own Worker, D1, R2 and KV. Still no Terraform. | Human |
| Q5 | Newsletter authorship | **Admins only** | Human |
| Q11 | Migration | **Core + inventory first**: migrate bodies and the core pages, and inventory the live site before deciding on archives and photos | Human |
| Q4 | Login providers | Default: passkeys + **both** Google and Microsoft (config-only; drop either one at any time) | Plan default |
| Q6 | Cadence | Default: **quarterly**. The first issue window is 90 days, later issues run since the last sent issue. | Plan default |
| Q7 | Signup abuse | Default: **Cloudflare Turnstile** on the signup form, verified server-side with `fetch` to siteverify. No npm dependency, so no receipt needed. | Plan default |
| Q8 | ICS VTIMEZONE | Default: add `timezones-ical-library` in M4, with a Context7 receipt task first | Plan default |
| Q9 | Officer titles | Default: standard title lists per body type, seeded; **lodge confirms in M1** | Plan default → client input |
| Q10 | Temple-wide events | Default: owned by the **Findlay Temple Board** body | Plan default |
| Q12 | Body contacts | Default: a **contact form per body** routed via the Resend transport; no email addresses published | Plan default |
| Q13 | DNS / sending domain | Handled in M8 (human tasks) | Plan |
| Q14 | Residual-risk sign-off | **Lodge sign-off** is a launch gate in M8 | Plan |

Plan defaults are reversible. Changing one updates the affected milestone, not the plan's shape.

## 3. Target layout
```
src/
  lib/
    core/            # pure, no I/O, 100% unit-tested
      acl/           # grant policy: (actor, editedBy[], grants, role, op, entryBody) → allow | deny(reason)
      recurrence/    # RRULE + EXDATE expansion (rrule-temporal), schedule-description formatter
      ics/           # event → ical-generator mapping
      newsletter/    # news + events → TipTap JSON issue document
    adapters/        # emdash-repo, resend-mailer, turnstile, clock
  pages/             # .astro routes + .ts endpoints (bodies, news, calendar, ics, newsletters, pages)
  components/ layouts/
plugins/
  body-access/       # native EmDash plugin: storage, hooks, React admin page
  newsletter/        # native EmDash plugin: routes, email:deliver, React admin page (EmailEditor)
seed/seed.json       # collections, bodies, officer titles (PATH_ASK)
tests/
  unit/              # Vitest (getViteConfig)
  e2e/               # Playwright, per-role storageState (admin, blue-lodge, chapter, unassigned-editor, anon)
docs/ spec/ plans/ adr/ runbooks/
```

## 4. Milestones

### M0 — Foundation and toolchain
**Goal:** the scaffold meets the constitution's Definition of Done on an empty feature set and deploys to staging.
- Bump `emdash`/`@emdash-cms/cloudflare` to 1.6.0, commit `pnpm-lock.yaml`, and pin `@react-email/editor` exactly.
- tsconfig → `astro/tsconfigs/strict`; fix any resulting errors in template code.
- Lint/format: house `oxlint.config.ts` + `.oxfmtrc.jsonc` (JS/TS Base), `.prettierrc (Astro)`, and the two-rule `eslint.config.mjs (Astro)`.
- Vitest 5 via `getViteConfig()`; Playwright 1.65 with a portless-wrapped `dev` and a setup project producing per-role `storageState`.
- `astro:env` schema for `RESEND_API_KEY`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID`, `TURNSTILE_SECRET`, OAuth IDs/secrets, `NEWSLETTER_TEST_ALLOWLIST`, all with `context: 'server', access: 'secret'` as appropriate.
- `wrangler.jsonc`: `staging` and `production` envs (D1, R2, KV, `observability` block with Axiom destinations), from the house Astro-on-Cloudflare template.
- GitHub Actions CI (Astro template): `astro check` → lint → format check → vitest → build → Playwright smoke.
- Project `AGENTS.md` built from the JS/TS Base + Astro overlay, carrying the Agent Scope from Phase 3.
- Verify Astro 7 against the overlay (the Phase 1 override). Record the outcome in STATUS.md.

**Exit check:** CI green on a PR. A human runs `pnpm run deploy:staging` (`CLOUDFLARE_ENV=staging astro build && wrangler deploy`) and the template renders at the staging URL.

### M1 — Content model and seed
**Goal:** every collection in the spec exists with correct fields, and the six bodies load.
- `seed.json` (**PATH_ASK: human approves the schema PR**):
  - `bodies`: name, number, slug, emblem, description, contactRecipients (private), scheduleNote, tagVocabulary (repeater), bodyType (select), resendTopicId, displayOrder.
  - `officers`: body ref (required, indexed), title (select), name, photo, termYear, displayOrder.
  - `events`: body ref (required, indexed), title, start, end, allDay, rrule, exdates (json), location, description (portableText), isStatedMeeting.
  - `news`: body ref (required, indexed), title, content, publishDate, featuredImage, tags (multiSelect), includeInNewsletter (default true).
  - `pages`: kept.
  - Remove the blog template's `posts` demo content.
- Seed the six bodies with live-site numbering (FR-9.2) and draft officer-title lists. **Client input:** the lodge confirms titles (Q9).
- Regenerate `emdash-env.d.ts` types.

**Exit check:** a local seeded site shows all collections in the admin. A type-check passes against the generated types. FR-9.2 seed assertion test is green.

### M2 — Pure core (no I/O)
**Goal:** all business rules exist as tested pure functions.
- `acl`: decision table over role (Admin bypass) × grants × actor + editedBy × operation (create/update/body-change/delete/publish/unpublish/schedule/upload) × single-grant auto-assign × missing-body. Covers FR-5.2–5.8.
- `recurrence`: expand(events, window, tz) with EXDATE removal; RRULE validation (FR-4.2); `describeSchedule(rrule)` ("2nd Tuesday of each month, 7:30 PM") for FR-1.3. DST tests for March and November America/New_York (FR-4.6), using Vitest 5 fake timers, which also mock `Temporal`.
- `ics`: event → ical-generator event, preserving RRULE/EXDATE/TZID. Receipt task for `timezones-ical-library`, then VTIMEZONE output (Q8).
- `newsletter`: assemble(newsSinceLastIssue, upcomingEvents, bodyOrder) → TipTap JSON using the `bodySection` and `articleCard` node schemas shared with the editor (FR-6.1). Idempotency key derivation (FR-6.7).
- Run the TypeScript Design Principles Gate on `src/lib/**`.

**Exit check:** `vitest run` is green, with 100% branch coverage on `acl` and `recurrence`.

### M3 — Authentication and `body-access` plugin
**Goal:** body write-isolation is enforced server-side and proven per role.
- Auth: passkeys + `google()` + `microsoft()` providers (FR-8.2); invite flow; runbook `docs/runbooks/onboard-body-editor.md`.
- Native plugin `body-access`: grants storage collection (userId, bodyId, indexes on both); hooks `content:beforeSave` (actor + every `editedBy`, body-field change, tag-vocabulary check FR-3.2, single-grant auto-assign), `content:beforeDelete`, `content:beforePublish/Unpublish/Schedule`, and `media:beforeUpload`, all delegating to `core/acl`. Rejections use `ContentSaveRejectedError` with plain-text reasons.
- React admin page "Body Access" (Admin only) to assign and revoke grants (FR-5.1).
- Playwright role suites: Blue Lodge editor cannot create, edit, retag, trash or publish Chapter content; can edit a peer's Blue Lodge entry; unassigned Editor is blocked; Admin can do everything. One test per FR-5.x.

**Exit check:** all FR-5 e2e tests are green locally and in CI.

### M4 — Public site
**Goal:** visitors can use every public page in the spec.
- **Design direction first** (run `design-ideation`, then a Design artifact for review). The template's neutral blog look is a placeholder. **Human approves the design** before layout work.
- Routes: `/` (home), `/bodies`, `/bodies/[slug]`, `/bodies/[slug]/news`, `/bodies/[slug]/calendar`, `/bodies/[slug]/calendar.ics`, `/news`, `/calendar`, `/calendar.ics`, `/newsletters`, `/newsletters/[slug]`, plus `pages` routes for About, Scholarships and Contact.
- Server-rendered month grid and agenda (FR-4.3/4.4) with body filter via query string; no client calendar library.
- Per-body contact form → Resend transport (Q12), with Turnstile.
- Accessibility: WCAG 2.1 AA (axe in Playwright); Lighthouse CI budget ≥ 90.
- Run the Astro Design Principles Gate (A1–A12) on all new `.astro`/route files.

**Exit check:** e2e for FR-1.x, 2.2, 3.3–3.4, 4.3–4.5, 6.8 (empty archive) and 9.1 is green. axe has zero AA violations. Lighthouse is ≥ 90 on staging.

### M5 — Newsletter plugin
**Goal:** an Admin can build, preview, test and send a sectioned newsletter, and visitors can subscribe.
- `email:deliver` Resend transport, with cc/replyTo (FR-8.1). Verify EmDash invites work on staging.
- Public subscribe route + signup form: Zod validation, Turnstile, Origin/CSRF rule (FR-7.1/7.2), Resend contact upsert into Segment + newsletter Topic + selected body Topics.
- React admin "Newsletter" page: issue list; "New issue" calls core assembly (FR-6.1); `EmailEditor` with `bodySection`/`articleCard` `EmailNode` extensions and `EmailTheming` matching the approved design (FR-6.2); save JSON (FR-6.3).
- Routes (Admin permission): test-send to allowlist only (FR-6.4); approve → Broadcast create/schedule with idempotency key, enforcing the "test-send since last edit" rule (FR-6.5–6.7); archive render (FR-6.8).
- Checkly HeartbeatMonitor wired to scheduled sends.

**Exit check:** unit tests (Resend adapter mocked) are green. On staging, an end-to-end test sends to the allowlisted inbox, and a Broadcast to a staging-only test Segment is received. FR-6.6 refusal is proven by test.

### M6 — Content migration
**Goal:** launch content is in place.
- Inventory findlaymason.org: all pages, PDFs, images and forms, written to `docs/migration-inventory.md`. **Human decides** on archive PDFs and Photos (Q11).
- Migrate the core pages (About, Scholarships, Contact, Home copy), body descriptions and emblems, and any published schedules/officers into staging.
- Build a redirect map from old `.html` URLs to new routes.

**Exit check:** every inventoried page is either migrated or explicitly marked "dropped" by the human. Redirect tests are green.

### M7 — Observability and hardening
**Goal:** the production-readiness gates pass.
- Axiom destinations live for staging/production (logs + traces); a dashboard for errors and the guard's SAVE_REJECTED counts.
- Checkly Playwright Check Suites tagged `@monitor` (home, a body page, calendar, ICS feed, signup) running against production.
- Performance: verify the P95 < 300 ms cached-page budget, and add caching headers / Astro cache hints where needed.
- Adversarial review of `body-access` and the newsletter routes (`abstract-data-code-devil`); fix findings.
- Runbooks: newsletter send, editor onboarding, grant changes, incident.

**Exit check:** the code-devil review has no open Critical/High findings. Checkly is green for 48 h on staging.

### M8 — Launch
**Goal:** findlaymason.org is served by the new platform.
- Lodge UAT on staging with real body editors. **Lodge signs off on the accepted residual risks** (Q14).
- Human tasks: Resend sending-domain DNS verification; production secrets in 1Password → Wrangler; `pnpm run deploy:production`; move the findlaymason.org DNS to Cloudflare; enable the redirects.
- ~~Promote the ADR draft to `docs/adr/ADR-001-…`~~ Done at plan approval (2026-11-23).

**Exit check:** production Checkly is green. The old URLs redirect. The first newsletter test send from production reaches the allowlist.

## 5. Requirement traceability
| Requirement | Milestone | Verified by |
|---|---|---|
| FR-1.1–1.4 | M4 (M2 for 1.3 formatter) | e2e + unit |
| FR-2.1–2.2 | M1, M4 | seed test + e2e |
| FR-3.1, 3.3, 3.4 | M1, M4 | e2e |
| FR-3.2 | M2, M3 | unit + e2e |
| FR-4.1–4.2 | M1, M2 | unit |
| FR-4.3–4.5 | M4 | e2e |
| FR-4.6 | M2 | unit (DST) |
| FR-5.1–5.8 | M2, M3 | unit + per-role e2e |
| FR-6.1–6.7 | M2, M5 | unit + staging e2e |
| FR-6.8 | M4, M5 | e2e |
| FR-7.1–7.2 | M5 | unit + e2e |
| FR-8.1–8.2 | M3, M5 | staging e2e |
| FR-9.1 | M6 | e2e |
| FR-9.2 | M1 | seed test |
| NFR a11y/perf | M4, M7 | axe, Lighthouse CI, Axiom P95 |

## 6. Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Astro 7 incompatibility with the house overlay or EmDash | Low | High | M0 verification; Astro 6 fallback is within EmDash's peer range |
| `@react-email/editor` (released April 2026) has breaking minor changes | Med | Med | Pin exact; TipTap JSON is the durable format; custom nodes isolated in one module |
| EmDash 1.x plugin API changes (hooks, `editedBy`) | Med | High | Pin; guard has exhaustive tests; re-run the M3 e2e suite on every EmDash bump |
| `@cloudflare/vitest-pool-workers` doesn't support Vitest 5 | Med | Low | Unit tests target the pure core only (no Workers pool needed); integration is covered by Playwright |
| Body editors find passkeys/OAuth confusing | Med | Med | Both OAuth providers, an onboarding runbook, UAT in M8 |
| Residual risks unacceptable to the lodge | Low | High | Sign-off is a launch gate; Option C is documented as the fallback ADR |
| D1/Workers CPU limits under SSR | Low | Med | Workers Paid; P95 budget measured in M7; caching |
| No design direction yet | High | Med | Explicit design gate at the start of M4 |

## 7. Human gates in this plan
1. ~~**This plan** (SDD Phase 2 → 3).~~ Approved 2026-11-23.
2. M1 schema PR (PATH_ASK) and the lodge's officer-title confirmation.
3. M4 design direction.
4. M6 archive/photos decision.
5. Every `wrangler deploy` (staging and production).
6. M8 lodge UAT and residual-risk sign-off.

## 8. Next step after approval
SDD Phase 3 (TASKS): break M0 and M1 into atomic `TASK.md` checkboxes. Later milestones are tasked when their predecessor's exit check passes.
