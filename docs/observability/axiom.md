# Axiom: logs, traces and the queries the Temple watches

**Who uses it:** whoever is on call for the site (see [incident.md](../runbooks/incident.md)).
**Where the data comes from:** each Worker environment exports its logs and traces over OTLP to Axiom (`observability` in `wrangler.jsonc`: destinations `axiom-<env>-logs` and `axiom-<env>-traces`). A human creates the Axiom datasets and the two Cloudflare destinations per environment (T0.12, T8.0); no SDK or key lives in the code.

## What reaches Axiom, and what is kept out

Three things leave the Worker: Cloudflare's invocation log for each request (method, URL, status, timing), the trace of each request (spans for the handler, `fetch`, D1, KV, R2; Cloudflare records URLs and query strings in spans but no header values), and every line written to the console, the site's and EmDash's.

- **Query strings.** EmDash carries preview tokens (`?_preview=`), magic-link, invite and sign-up tokens (`?token=`) in the query string. `observability.redact_query_string` is `true` in both environments (`wrangler.jsonc`, PATH_ASK; checked by `tests/unit/wrangler-envs.test.ts`), so invocation logs and traces keep each URL's path only. Invocation logs stay on: they are how requests, status codes and wall time reach the queries below.
- **Email addresses in console lines.** The site's own events never carry one (below). EmDash's lines can: a failed delivery names its recipient (`[email:deliver] Provider "newsletter" failed to send email to "…"`, which for the contact form is a body's private recipient), and sign-ins name the user (`[external-auth] Provisioned user: …`). `src/worker.ts` wraps the console at start-up (`redactConsoleEmails`), so every string and error argument reaches Workers Logs with each address replaced by `[email]` (`tests/unit/worker-console.test.ts`; checked under `wrangler dev`, where an invite refused on a non-production Worker logged `failed to send email to "[email]"`).
- **What still can.** An address inside an object passed to the console whole (EmDash's `console.log(label, object)` lines pass objects as they are; none seen to hold an address), and an address in a URL path (no EmDash route puts one there). Span attributes beyond URLs were not inspected on real data; check one day of staging traces in Axiom's schema view (monitoring-setup § 1.5).
- **Retention.** Workers Logs keeps logs for up to 7 days. In Axiom, keep the logs and traces datasets for 30 days: long enough to investigate an incident reported a few weeks late, short enough that a residual address does not sit for months. Set it on each dataset when it is created (monitoring-setup § 1).

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
| `heartbeat.failed` | warn | `status`, `error` | The scheduler ran but its Checkly heartbeat ping did not land |
| `scheduler.failed` | error | `error` | EmDash's scheduled run threw, so that cron run sent no heartbeat |
| `scheduler.overdue` | error | `entries`, `collections` (counts, up to 100 a collection) | At the top of the hour, entries the run had to publish are still waiting, so no heartbeat went. Logged with or without `CHECKLY_HEARTBEAT_URL` |
| `scheduler.check_failed` | error | `error` | The overdue check could not read the database, so no heartbeat went |
| `cache.purge_failed` | warn | `tags` (a count), `error` | A scheduled publish could not purge its pages' edge copies; they expire on their own within the hour |

## Queries

The dataset names below are the ones the runbook creates: `findlay-masonic-<env>-logs` and `findlay-masonic-<env>-traces`. Cloudflare exports each `console` line as an OpenTelemetry log record whose `body` is the line, so the site's events are read with `parse_json(body)`. Check the field names against the first day of data (Axiom's schema view): if Cloudflare's export names the message field differently, change `body` in each query.

### Site events, parsed

Save this as the view `site_events`; the queries below start from it.

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where isnotempty(e.event)
| extend event = tostring(e.event), level = tostring(e.level)
```

### Errors

Everything at error level, the site's own and Cloudflare's (uncaught exceptions, exceeded limits), by hour:

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where tostring(e.level) == "error" or severity_text =~ "error" or body contains "Uncaught"
| summarize errors = count() by bin(_time, 1h), event = coalesce(tostring(e.event), "uncaught")
| order by _time desc
```

Alert: more than 5 in 15 minutes.

### Denials and rejections

Who was refused what, by refusal and source. A steady trickle is editors working outside their body; a burst from one user is worth a look.

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where tostring(e.event) == "body_access.refused"
| summarize refusals = count() by code = tostring(e.code), source = tostring(e.source), user = tostring(e.user), bin(_time, 1d)
| order by refusals desc
```

`SAVE_REJECTED` alone, with the reason an editor saw:

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where tostring(e.event) == "body_access.refused" and tostring(e.code) == "SAVE_REJECTED"
| project _time, user = tostring(e.user), collection = tostring(e.collection), reason = tostring(e.reason)
| order by _time desc
```

Guard lookups that failed (each refused a legitimate-looking write; more than one an hour means D1 trouble):

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where tostring(e.event) == "body_access.lookup_failed"
| project _time, route = tostring(e.route), method = tostring(e.method), error = tostring(e.error)
```

### Forms, limits and email

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where tostring(e.event) in ("form.submitted", "form.rate_limited", "email.failed", "email.blocked")
| summarize n = count() by event = tostring(e.event), form = tostring(e.form), outcome = coalesce(tostring(e.outcome), tostring(e.limit), tostring(e.kind)), bin(_time, 1d)
```

Alert: any `form.submitted` with `outcome == "unavailable"` (the forms are broken), and any `email.failed`.

### Scheduled work and cache purges

The Checkly heartbeat proves the cron fires, EmDash's scheduled run returns and, at the top of the hour, that nothing it had to publish is still waiting (`checkly/scheduler.check.ts`). EmDash treats a failure inside the run as non-fatal: one collection's publish sweep, the cleanup or a purge logs its own plain-text line (`[scheduled-publish] …`, `[cron] …`, `[cleanup] …`, `[cache] Failed to invalidate …`) and the run still returns. A failed publish leaves its entry due, which the next hourly check reports as `scheduler.overdue` and withholds the ping; the other lines stop nothing. These lines are not JSON, so they are matched on the body:

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where tostring(e.event) in ("scheduler.failed", "scheduler.overdue", "scheduler.check_failed", "cache.purge_failed", "heartbeat.failed")
	or body startswith "[scheduled-publish]" or body startswith "[cron]"
	or body startswith "[cleanup]" or body startswith "[cache] Failed"
| project _time, event = coalesce(tostring(e.event), extract(@"^\[([^\]]+)\]", 1, body)), error = coalesce(tostring(e.error), body)
| order by _time desc
```

Alert: any `scheduler.failed`, `scheduler.overdue`, `scheduler.check_failed` or `[scheduled-publish]` line (scheduled content may not go live; [incident.md](../runbooks/incident.md) § 6 finds the waiting entries). A `cache.purge_failed` or `[cache] Failed` line is a warning: the page shows old content until its max-age runs out (an hour for content pages).

### Newsletter sends

```kusto
['findlay-masonic-production-logs']
| extend e = parse_json(body)
| where tostring(e.event) startswith "newsletter."
| project _time, event = tostring(e.event), issue = tostring(e.issue), revision = toint(e.revision), status = tostring(e.status), code = tostring(e.code), broadcast = tostring(e.broadcast)
| order by _time desc
```

### P95 server time

The budget (constitution amendment 1) is P95 under 300 ms on cached public pages. A page served from Cloudflare's cache never runs the Worker, so its server time is the cache's; the traces measure the Worker's renders, which is every cache miss and every page that is not cached. Under budget there means under budget for visitors too.

Workers traces arrive with one root span per request. Its `duration` is the Worker's wall time for the request, D1 round trips included:

```kusto
['findlay-masonic-production-traces']
| where isempty(parent_span_id)
| extend route = tostring(attributes['http.route']), path = tostring(attributes['url.path'])
| where not(path startswith "/_emdash")
| summarize p50 = percentile(duration, 50), p95 = percentile(duration, 95), requests = count() by bin(_time, 1h)
```

By page, over a day, to find the slow one:

```kusto
['findlay-masonic-production-traces']
| where isempty(parent_span_id)
| extend path = tostring(attributes['url.path'])
| where not(path startswith "/_emdash") and not(path endswith ".ics")
| summarize p95 = percentile(duration, 95), requests = count() by path
| where requests >= 20
| order by p95 desc
```

Alert: hourly P95 above 300 ms for two hours running.

The D1 child spans show how much of a render is database time:

```kusto
['findlay-masonic-production-traces']
| where name startswith "d1" or tostring(attributes['db.system']) == "cloudflare-d1"
| summarize p95_query = percentile(duration, 95), queries = count() by bin(_time, 1h)
```

## Dashboard

One Axiom dashboard per environment with four charts: errors by hour, refusals by code, forms and email by outcome, and P95 server time by hour. The production one also shows the Checkly results (Checkly's Axiom integration, optional). Staging uses the same queries against `findlay-masonic-staging-*`.
