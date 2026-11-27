# Workers Logs: logs, traces and what the Temple watches

**Who uses it:** whoever is on call for the site (see [incident.md](../runbooks/incident.md)).
**Where the data is:** Cloudflare only. Each Worker environment has Workers Logs and Workers Traces turned on (`observability` in `wrangler.jsonc`), and nothing is exported elsewhere. Open them in the Cloudflare dashboard: **Workers & Pages → the Worker (`findlay-masonic-emdash` for staging, `findlay-masonic-emdash-production`) → Observability**. No SDK, key or third-party account is involved.

## What is recorded, and what is kept out

Three things are recorded: Cloudflare's invocation log for each request (method, URL, status, timing), the trace of each request (spans for the handler, `fetch`, D1, KV, R2; Cloudflare records URLs and query strings in spans but no header values), and every line written to the console, the site's and EmDash's.

- **Query strings.** EmDash carries preview tokens (`?_preview=`), magic-link, invite and sign-up tokens (`?token=`) in the query string. `observability.redact_query_string` is `true` in both environments (`wrangler.jsonc`; checked by `tests/unit/wrangler-envs.test.ts`), so invocation logs and traces keep each URL's path only.
- **Email addresses in console lines.** The site's own events never carry one (below). EmDash's lines can: a failed delivery names its recipient (`[email:deliver] Provider "newsletter" failed to send email to "…"`, which for the contact form is a body's private recipient), and sign-ins name the user (`[external-auth] Provisioned user: …`). `src/worker.ts` wraps the console at start-up (`redactConsoleEmails`), so every string and error argument reaches Workers Logs with each address replaced by `[email]` (`tests/unit/worker-console.test.ts`).
- **What still can.** An address inside an object passed to the console whole (EmDash's `console.log(label, object)` lines pass objects as they are; none seen to hold an address), and an address in a URL path (no EmDash route puts one there). Span attributes beyond URLs were not inspected on real data; check a day of staging traces once ([monitoring-setup.md](../runbooks/monitoring-setup.md) § 3).
- **Retention.** Workers Logs and Traces keep data for 7 days on the Workers Paid plan. An incident reported later than that cannot be investigated from the logs; note the time of anything odd when it is reported.

## What the Worker logs

Besides Cloudflare's own invocation logs, the site writes one JSON object per line for the events below (`src/lib/adapters/log.ts`). Every line has `level` and `event`. Fields are primitives only, and every string is scrubbed: an email address becomes `[email]` and a run of 32 or more letters, digits, `_`, `+`, `/` or `=` becomes `[redacted]`. No line carries a message body, a recipient address or a secret (`tests/unit/adapters/log.test.ts`).

| `event` | `level` | Fields | Written when |
| --- | --- | --- | --- |
| `body_access.refused` | warn | `code` (`BODY_ACCESS_DENIED`, `INVALID_SLUG`, `SAVE_REJECTED`), `source` (`middleware`, `beforeSave`, `publish`, `unpublish`, `schedule`), `user`, `route`, `method`, `collection`, `reason` | The body-access guard refused a write |
| `body_access.lookup_failed` | error | `route`, `method`, `user`, `error` | A read the guard needed failed, so it refused |
| `newsletter.test_sent` | info | `issue`, `revision`, `recipients` (a count) | A test send went to the allowlist |
| `newsletter.approved` | info | `issue`, `revision`, `status` (`sent`, `scheduled`, `creating`), `broadcast`, `scheduled` | An Admin approved an issue |
| `newsletter.refused` | warn, error when `code` is `unavailable` or `not-configured` | `action` (`test-send`, `approve`), `issue`, `code` | A test send or approval was refused |
| `form.submitted` | info for `sent`/`ok`, error for `unavailable`, warn otherwise | `form` (`contact`, `subscribe`), `outcome` | Every contact message and signup |
| `form.rate_limited` | warn | `form`, `limit` (`sender` or `target`) | A rate limit refused a form post |
| `form.sweep_failed` | warn | `namespace` (`contact-rate`, `subscribe-rate`), `error` | Deleting a form's past-window rate-limit counters failed; the next window tries again |
| `email.blocked` | warn | `siteEnv`, `action` (`email`, `signup`, `broadcast`), `recipients`, `blocked` (counts) | A non-production Worker refused an email, a signup or a Broadcast that would reach an address off the allowlist |
| `email.failed` | error | `kind` (`rejected`, `unavailable`, `blocked`), `status`, `error` | Resend did not accept an email (invites, contact messages), or the gate refused it |
| `scheduler.failed` | error | `error` | EmDash's scheduled run threw; the cron run fails |
| `scheduler.overdue` | error | `entries`, `collections` (counts, up to 100 a collection) | At the top of the hour, entries the run had to publish are still waiting |
| `scheduler.check_failed` | error | `error` | The hourly overdue check could not read the database |
| `cache.purge_failed` | warn | `tags` (a count), `error` | A scheduled publish could not purge its pages' edge copies; they expire on their own within the hour |

## Finding things

Workers Logs indexes each JSON line field by field, so the site's events are filtered by field in the Observability **Query Builder** (or **Events** view): add a filter `event` = the event name, or `level` = `error`. Save the ones below as saved queries per Worker.

| Saved query | Filter | Look at |
| --- | --- | --- |
| Errors | `level` = `error`, or the invocation outcome is an exception | Group by `event`. More than a handful in 15 minutes is worth a look |
| Refusals | `event` = `body_access.refused` | Group by `code`, `source`, `user`. A steady trickle is editors working outside their body; a burst from one user is worth a look |
| Save rejections | `event` = `body_access.refused` and `code` = `SAVE_REJECTED` | `user`, `collection`, `reason` (what the editor saw) |
| Guard lookups that failed | `event` = `body_access.lookup_failed` | Each refused a legitimate-looking write; more than one an hour means D1 trouble |
| Forms and email | `event` is one of `form.submitted`, `form.rate_limited`, `email.failed`, `email.blocked` | Group by `event`, `form`, `outcome`. `outcome` = `unavailable` means the forms are broken |
| Scheduled work and cache purges | `event` is one of `scheduler.failed`, `scheduler.overdue`, `scheduler.check_failed`, `cache.purge_failed`, or the message starts with `[scheduled-publish]`, `[cron]`, `[cleanup]` or `[cache] Failed` | See below |
| Newsletter sends | `event` starts with `newsletter.` | `issue`, `revision`, `status`, `code`, `broadcast` |

**Scheduled work.** EmDash treats a failure inside its scheduled run as non-fatal: one collection's publish sweep, the cleanup or a purge logs its own plain-text line (`[scheduled-publish] …`, `[cron] …`, `[cleanup] …`, `[cache] Failed to invalidate …`) and the run still returns. A failed publish leaves its entry due, which the Worker's hourly check (`src/worker.ts`) reports as `scheduler.overdue` at error level. These EmDash lines are not JSON, so they are matched on the message text. A `cache.purge_failed` or `[cache] Failed` line is a warning: the page shows old content until its max-age runs out (an hour for content pages).

**Server time (P95).** The budget (constitution amendment 1) is P95 under 300 ms on cached public pages. A page served from Cloudflare's cache never runs the Worker; the Worker's renders are every cache miss and every uncached page. The Worker's **Metrics** tab shows wall time percentiles, and the Traces view shows a request's root span with its D1 child spans, which is how much of a render is database time. For a page-by-page view, query the traces in the Query Builder grouped by URL path, excluding `/_emdash`.

## Alerts

Cloudflare offers two kinds, both set up in the dashboard ([monitoring-setup.md](../runbooks/monitoring-setup.md) § 2):

- **Workers Issues** groups failures: uncaught exceptions, failed invocations, `5xx` responses and console lines at error level. Every event the site logs at `error` above becomes an issue, including `scheduler.overdue`, `scheduler.failed`, `scheduler.check_failed`, `email.failed`, `body_access.lookup_failed` and an `unavailable` form. An Issues automation emails the Temple administrators on the first occurrence.
- **Monitors** (Notifications) run a query on a schedule and alert above a threshold. Use one for warnings Issues does not count: `body_access.refused` bursts (more than 20 in an hour) and `form.rate_limited` (more than 10 in an hour).

There is no uptime check outside Cloudflare. A Worker that stops answering shows as `5xx` responses and failed invocations in Issues; one that receives no traffic at all shows nothing. After each deploy, the post-deploy checks run by hand ([deploy.md](../runbooks/deploy.md) § Check).

## Dashboard

Optional: a Cloudflare **Custom Dashboard** (Analytics → Custom Dashboards) built on the datasets "Workers Observability — Logs" and "Workers Observability — Traces (OTel)", with four charts per environment: errors by hour, refusals by `code`, forms and email by `outcome`, and P95 wall time by hour.
