# spec.md — Findlay Masonic Platform
## Version: 0.2.0 (Draft — open questions resolved for PLAN, 2026-11-23)
## Date: 2026-11-23
## Constitution: ./project-constitution.md

## Problem Statement
The Findlay Masonic Bodies (Blue Lodge No. 227, Chapter No. 58, Council No. 50, Commandery No. 49, Order of the Eastern Star No. 23, and the Findlay Temple Board) share a dated Weebly-hosted site, findlaymason.org. Its body pages, "Temple Calendar" and "Quarterly Newsletters" are static and maintained by whoever holds the site login. Bodies cannot publish their own meeting schedules, officers or news, there is no combined calendar that members can subscribe to, and the newsletter is assembled by hand.

This system replaces findlaymason.org with an EmDash CMS on Cloudflare. Each body gets its own page, calendar and news stream, maintained by that body's editors, who are blocked from changing any other body's content. Temple administrators get a newsletter builder that pulls each body's latest news into per-body sections and sends the result through Resend, plus combined and per-body calendars with subscribable ICS feeds.

## Scope
### In scope
- A `bodies` collection and a public page per body: description, emblem, meeting schedule, officers, recent news, upcoming events
- `officers`, `events` and `news` collections, each scoped to a body
- Per-body and combined Temple calendars (HTML views + ICS feeds), including recurring meetings
- `body-access` native plugin: body grants, grant administration, and server-side write guards
- `newsletter` native plugin: issue builder with the embedded React Email editor, test send, Resend Broadcast create/schedule, and public subscribe endpoint with per-body topic preferences
- A Resend `email:deliver` transport for EmDash system email (invites, login)
- Static pages carried over from the current navigation: Home, About Freemasonry, Scholarships, Contact Us (EmDash `pages` collection)
- Login via passkeys plus EmDash built-in Google and/or Microsoft providers
- Observability: Cloudflare Workers Logs and Traces, Workers Issues and Monitors (no third-party services; 2026-11-27)
- Migration of current body names, numbers and any existing schedules/officers from findlaymason.org (see Open Questions for archive scope)

### Out of scope
- Dues, payments, donations or any e-commerce (DashCommerce is not adopted)
- A members-only area or gated content for the public
- Event RSVPs, ticketing or attendance tracking
- Per-recipient personalized newsletters (dropping sections a subscriber opted out of); per-body Topics are captured but not used to filter the combined issue
- Read isolation between bodies in the admin, and isolation of site-wide menus, widgets, sections and bylines (accepted residual risks; constitution § Per-body access control)
- Sandboxed or registry-published EmDash plugins
- Multilingual content
- A replacement for the current Photos page beyond a standard EmDash page (see Open Questions)
- Re-styling or rebuilding the 2023 Flywheel/Elementor staging design; `docs/site-inventory.md` is reference only

## Functional Requirements

### FR-1 Bodies and body pages
**FR-1.1**
WHEN a visitor requests `/bodies/{slug}`
THE public body page
SHALL render the body's name, number, emblem, description, next three meeting occurrences, current officers in display order, the five most recent published news items, and upcoming events for the next 60 days
SO THAT members and prospective members find everything about one body in one place.

**FR-1.2**
WHEN a visitor requests `/bodies`
THE bodies index page
SHALL list every published body with its name, number, emblem and next meeting occurrence
SO THAT visitors can navigate to any body.

**FR-1.3**
WHEN a body's recurring "stated meeting" event exists
THE body page
SHALL display the meeting schedule derived from that event's RRULE (e.g. "2nd Tuesday of each month, 7:30 PM") together with the body's optional schedule note
SO THAT the schedule shown always matches the calendar.

**FR-1.4**
WHEN a body has no recurring stated-meeting event
THE body page
SHALL display the schedule note if present, and otherwise a "Contact the secretary for meeting times" message
SO THAT a missing schedule never renders as an empty or broken section.

### FR-2 Officers
**FR-2.1**
WHEN an editor granted to a body saves an `officers` entry for that body
THE `officers` collection
SHALL store the title (from a fixed per-body-type select list), name, optional photo, term year and display order
SO THAT each body can keep its officer roster current.

**FR-2.2**
WHEN a body page renders officers
THE body page
SHALL show only officers whose term year matches the body's current term, ordered by display order
SO THAT past officers do not appear as current.

### FR-3 Body news
**FR-3.1**
WHEN an editor granted to a body creates a `news` entry
THE `news` collection
SHALL require a `body` reference, title, content (portable text) and publish date, and accept optional featured image, tags and an `includeInNewsletter` flag (default true)
SO THAT every news item belongs to exactly one body and is eligible for the newsletter.

**FR-3.2**
WHEN a `news` entry is saved with tags
THE `body-access` guard
SHALL reject the save with SAVE_REJECTED if any tag is not in that body's tag vocabulary on its `bodies` entry
SO THAT tags stay body-scoped.

**FR-3.3**
WHEN a visitor requests `/bodies/{slug}/news`
THE body news page
SHALL list that body's published news newest first, 10 per page, with tag filtering
SO THAT visitors can browse one body's history.

**FR-3.4**
WHEN a visitor requests `/news`
THE combined news page
SHALL list published news from all bodies newest first, labelled by body, filterable by body
SO THAT the Temple has one place for all updates.

### FR-4 Calendars
**FR-4.1**
WHEN an editor granted to a body saves an `events` entry
THE `events` collection
SHALL store the body reference, title, start and end in America/New_York, all-day flag, optional RRULE string, optional EXDATE list, location and description
SO THAT one-off and recurring events share one model.

**FR-4.2**
WHEN an `events` entry is saved with an RRULE
THE events save path
SHALL reject the save if `rrule-temporal` cannot parse the RRULE with its DTSTART
SO THAT invalid recurrence never reaches the calendar.

**FR-4.3**
WHEN a visitor requests `/bodies/{slug}/calendar` for a month
THE body calendar page
SHALL render a server-side month grid and agenda list of that body's occurrences for the month, expanding recurring events and omitting EXDATE occurrences
SO THAT members see accurate dates without client-side JavaScript.

**FR-4.4**
WHEN a visitor requests `/calendar` for a month
THE combined calendar page
SHALL render occurrences from all bodies, each labelled and color-coded by body, with a filter to show selected bodies only
SO THAT members can see everything happening at the Temple.

**FR-4.5**
WHEN a calendar client requests `/bodies/{slug}/calendar.ics` or `/calendar.ics`
THE ICS endpoint
SHALL return a `text/calendar` feed generated by `ical-generator` containing the body's (or all bodies') events with RRULE and EXDATE preserved and TZID America/New_York
SO THAT members can subscribe in Google, Apple or Outlook calendars.

**FR-4.6**
WHEN a recurring event's occurrence falls on a DST transition date
THE recurrence core (`src/lib/core/recurrence`)
SHALL produce the occurrence at the intended local wall-clock time
SO THAT a 7:30 PM meeting never shifts to 6:30 or 8:30 PM.

### FR-5 Per-body access control
**FR-5.1**
WHEN an Admin assigns or revokes a grant between a user and one or more bodies on the Body Access admin page
THE `body-access` plugin
SHALL persist the grant in plugin storage and apply it to the user's next request
SO THAT administrators control who maintains each body.

**FR-5.2**
WHEN a user without a grant for body X saves, creates or changes the `body` of an entry so that it belongs to body X
THE `body-access` guard (`content:beforeSave`)
SHALL reject the save with SAVE_REJECTED and a plain-text reason naming the body
SO THAT bodies cannot change each other's content.

**FR-5.3**
WHEN a save carries an `editedBy` list
THE `body-access` guard
SHALL evaluate the grant policy for the actor and every `editedBy` user and reject if any lacks the grant
SO THAT edits from an unauthorized user cannot be published by an authorized one.

**FR-5.4**
WHEN a user without a grant for an entry's body attempts to trash, publish, unpublish or schedule it
THE `body-access` guard (`content:beforeDelete`, `content:beforePublish`, `content:beforeUnpublish`, `content:beforeSchedule`)
SHALL cancel the operation
SO THAT publication state is controlled only by that body's editors or Admins.

**FR-5.5**
WHEN a user holding exactly one body grant creates a body-scoped entry without a `body` value
THE `body-access` guard
SHALL set `body` to the user's granted body
SO THAT single-body editors never have to pick their body.

**FR-5.6**
WHEN a user holding no body grant and no Admin role creates a body-scoped entry
THE `body-access` guard
SHALL reject the save
SO THAT unassigned Editors cannot create body content.

**FR-5.7**
WHEN an Admin (role 50) performs any of the above operations
THE `body-access` guard
SHALL allow it regardless of grants
SO THAT Temple administrators can correct any body's content.

**FR-5.8**
WHEN a body-scoped collection entry is saved with no `body` reference after FR-5.5 has run
THE `body-access` guard
SHALL reject the save
SO THAT no body-scoped content exists outside the access model.

### FR-6 Newsletter builder
**FR-6.1**
WHEN an Admin starts a new issue on the Newsletter admin page
THE `newsletter` plugin
SHALL assemble a draft from published `news` with `includeInNewsletter = true` dated after the last sent issue (or the last 90 days for the first issue), grouped into one section per body in a fixed body order, each item with title, excerpt, image and link, followed by each body's upcoming events for the next 60 days
SO THAT the Admin starts from a complete draft instead of copying content by hand.

**FR-6.2**
WHEN the draft is assembled
THE `newsletter` plugin
SHALL load it into the embedded `@react-email/editor` `EmailEditor` using custom `EmailNode` blocks for "body section" and "article card"
SO THAT the Admin can edit, reorder and restyle sections visually.

**FR-6.3**
WHEN the Admin saves an issue
THE `newsletter` plugin
SHALL persist the TipTap JSON (`getJSON()`), subject, preview text and status `draft`
SO THAT the issue can be reopened and edited later.

**FR-6.4**
WHEN the Admin requests a test send
THE `newsletter` plugin route
SHALL compose HTML and text via `composeReactEmail({ editor, pretty: false })` and send it with `resend.emails.send` only to addresses on the configured admin allowlist
SO THAT the issue is previewed in real inboxes before any subscriber receives it.

**FR-6.5**
WHEN the Admin approves an issue that has had at least one successful test send since its last edit
THE `newsletter` plugin route
SHALL create a Resend Broadcast to the `subscribers` Segment under the newsletter Topic with the composed HTML (including `{{{RESEND_UNSUBSCRIBE_URL}}}`), either sent immediately or scheduled at the chosen time, and store the broadcast id, sent/scheduled time and final HTML on the issue
SO THAT subscribers receive exactly what was previewed and the send is auditable.

**FR-6.6**
WHEN an issue is approved without a test send since its last edit
THE `newsletter` plugin route
SHALL refuse to create the Broadcast
SO THAT no unpreviewed content reaches subscribers.

**FR-6.7**
WHEN a Broadcast is created
THE `newsletter` plugin
SHALL use an idempotency key derived from the issue id and revision
SO THAT a retried request cannot send the same issue twice.

**FR-6.8**
WHEN a visitor requests `/newsletters`
THE newsletter archive page
SHALL list sent issues newest first and render each sent issue's stored HTML in an archive view
SO THAT the "Quarterly Newsletters" archive continues on the new site.

### FR-7 Subscription
**FR-7.1**
WHEN a visitor submits the Email Signup form with an email address and selected bodies
THE `newsletter` public subscribe route
SHALL validate the input, create or update the Resend contact in the `subscribers` Segment, opt it into the newsletter Topic and opt it into each selected body Topic
SO THAT signups land directly in Resend with their body preferences recorded.

**FR-7.2**
WHEN the subscribe route receives a request whose Origin is not the site and lacks `X-EmDash-Request: 1`
THE `newsletter` public subscribe route
SHALL reject it with 403
SO THAT the public route cannot be abused cross-origin.

### FR-8 System email and authentication
**FR-8.1**
WHEN EmDash sends a system email (invite, login, notification)
THE `newsletter` plugin's `email:deliver` transport
SHALL deliver it via Resend including `cc` and `replyTo` when present
SO THAT all site email goes through one verified sending domain.

**FR-8.2**
WHEN a body editor signs in
THE EmDash auth layer
SHALL accept a passkey or the configured Google/Microsoft provider for an existing linked account
SO THAT secretaries are not forced to set up passkeys.

### FR-9 Static pages and migration
**FR-9.1**
WHEN the site launches
THE `pages` collection
SHALL contain Home, About Freemasonry, Scholarships and Contact Us with content migrated from findlaymason.org
SO THAT no current page disappears at cutover.

**FR-9.2**
WHEN body seed data is loaded
THE seed
SHALL create the six bodies with the numbering from the live findlaymason.org (Chapter No. 58, Council No. 50), not the 2023 staging build
SO THAT body numbers are correct at launch.

## Non-functional Requirements
- **Security (constitution § Per-body access control):** all body-write authorization is enforced server-side in `content:*` hooks; hiding admin UI is never the boundary. The grant policy is a pure function with exhaustive tests covering actor × editedBy × grant × role × operation.
- **Security (constitution § Secrets and configuration):** `RESEND_API_KEY`, and OAuth secrets come from 1Password Environments → Wrangler secrets → `astro:env` server secrets; none appear in client bundles or logs.
- **Security (constitution § Newsletter and email):** the `resend` SDK is imported only in plugin routes and the transport. Non-production sends go only to the allowlisted admin inbox.
- **Data integrity (constitution § Per-body access control):** every body-scoped entry has a required, indexed `body` reference.
- **Data integrity (constitution § Calendar):** recurrence is stored as RRULE + DTSTART (America/New_York) + EXDATE and never pre-expanded.
- **Data integrity (constitution § Newsletter and email):** each issue stores TipTap JSON and the final sent HTML. Broadcast creation is idempotent per issue revision.
- **Data integrity (constitution § Data integrity and operations):** schema changes to `seed/seed.json` require human confirmation.
- **Frontend (constitution § Frontend):** public pages ship zero client JS except explicitly justified islands. Rich text is rendered via PortableText, never `set:html`.
- **Accessibility (human decision 2026-11-23, PLAN §2):** all public pages and plugin admin pages meet WCAG 2.1 AA; zero axe AA violations in e2e.
- **Performance (human decision 2026-11-23, PLAN §2):** Lighthouse ≥ 90 (Performance, Accessibility, Best Practices, SEO) on public pages; P95 server time < 300 ms on cached public pages, measured with Workers Logs and Traces.
- **Environments (human decision 2026-11-23, PLAN §2):** separate `staging` and `production` Wrangler environments, each with its own Worker, D1, R2 and KV.
- *Constitution note:* these three NFRs come from the PLAN-phase human decisions and are recorded as constitution amendment 1 (2026-11-23).

## Open questions — resolved 2026-11-23 (see plans/0001-findlay-masonic-platform/PLAN.md §2)
| # | Topic | Resolution |
|---|---|---|
| 1–2 | Performance / accessibility | WCAG 2.1 AA; Lighthouse ≥ 90; P95 < 300 ms cached (human) |
| 3 | Staging | Yes, staging + production Wrangler environments; no Terraform (human) |
| 4 | Login providers | Passkeys + Google + Microsoft (default) |
| 5 | Newsletter authorship | Admins only (human) |
| 6 | Cadence | Quarterly; 90-day first window (default) |
| 7 | Signup abuse | Cloudflare Turnstile, server-side verification (default) |
| 8 | ICS VTIMEZONE | `timezones-ical-library`, receipt in M2 (default) |
| 9 | Officer titles | Standard per body type; **lodge confirms in M1** |
| 10 | Temple-wide events | Owned by the Findlay Temple Board body (default) |
| 11 | Migration | Core + inventory first; **human decides archives/photos in M6** (human) |
| 12 | Body contacts | Per-body contact form via the Resend transport; no published addresses (default) |
| 13 | DNS / sending domain | M8 human tasks |
| 14 | Residual risks | **Lodge sign-off is an M8 launch gate** |
