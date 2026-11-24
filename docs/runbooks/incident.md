# Runbook: something is wrong with the site

**Who runs it:** whoever got the alert (Checkly, Axiom) or the report. Steps 1 to 3 need only read access; rolling back and changing secrets need deploy rights.
**Rule:** restore service first, understand it second. Write down what you did and when, as you go.

## 1. How bad is it?

| What you see | Severity | First move |
| --- | --- | --- |
| The site is down or every page errors | High | Roll back (step 3) |
| One page or the calendar feed fails | Medium | Find the error (step 2), then roll back if a deploy caused it |
| Editors are refused writes they should be allowed | Medium | Step 2, `body_access.refused`; see [grant-changes.md](grant-changes.md) |
| Contact or signup forms say they are not working | Medium | Step 2, `form.submitted` with `unavailable`; check Resend and Turnstile status pages |
| A newsletter went wrong | High if it reached subscribers | Step 4 |
| The heartbeat alert fired | Medium | Scheduled content is not going live: the cron stopped, EmDash's scheduled run throws, or entries past their time are still waiting. Step 2: the "Scheduled work" query in `axiom.md` shows `scheduler.failed`, `scheduler.overdue` or `scheduler.check_failed`. For `scheduler.overdue`, step 6. Roll back if a deploy caused it |

## 2. Read the logs

- **Axiom:** the queries in [docs/observability/axiom.md](../observability/axiom.md). Start with "Errors" for the last hour, then "P95 server time".
- **Cloudflare, live:** `pnpm wrangler tail --env production --format pretty` streams the production Worker's logs as they happen (read-only; needs a Cloudflare login). Add `--status error` to see only failures.
- **Cloudflare dashboard:** **Workers & Pages → findlay-masonic-emdash-production → Logs** for the last hours, with each request's logs and exceptions.
- The site's own lines are JSON with an `event` field. They never contain message bodies, recipient addresses or secrets, so they are safe to paste into a ticket.

## 3. Roll back a deploy

Cloudflare keeps earlier versions of the Worker.

```bash
pnpm wrangler deployments list --env production   # find the last good version id
pnpm wrangler rollback <version-id> --env production --message "incident: <short reason>"
```

Rollback changes the code only. D1 data, R2 media, KV sessions and secrets stay as they are, and a migration the bad version applied is not undone. The Worker's cache is kept per version, so the earlier version may serve pages it cached while it was live, an hour old at most; the dashboard's cache purge does not reach a Worker's cache ([deploy.md](deploy.md) § Cache). Then check the site as in [deploy.md](deploy.md) § Check. Fix forward on a branch; the next deploy replaces the rolled-back version.

## 4. Stop newsletter sends

Sends need an Admin's approval, so nothing new goes out unless someone approves. To stop sending entirely:

1. **A scheduled Broadcast that has not gone yet:** in the Resend dashboard, **Broadcasts**, open the one named `fm-issue:<issue id>:rev:<version>` and cancel it. The site's issue keeps showing **Scheduled**; discard or re-approve it later.
2. **Block all email from the site:** in the Resend dashboard, revoke the API key the Worker uses (**API Keys**). Every send fails at once, and the admin page says Resend refused it. Invites then show their links instead of emailing them only after the next deploy without `RESEND_API_KEY`; until then they fail. To restore, create a new key and `pnpm wrangler secret put RESEND_API_KEY --env production`.
3. **Block only non-allowlisted email:** set `SITE_ENV` to `staging` in `env.production.vars` in `wrangler.jsonc` and deploy. Every email then goes only to `NEWSLETTER_TEST_ALLOWLIST`, the signup form takes no new subscribers, and the site refuses to create or send a Broadcast to a Segment that holds anyone off the list. A Broadcast Resend already holds as scheduled is not the site's to stop, so also do step 1 for those.

If a newsletter reached subscribers by mistake, do not send a correction straight away. Tell the Temple administrators, agree the wording, then send it as a normal issue.

## 5. A form is being abused

The contact form takes five messages an hour from one network (an IPv6 /64 or an IPv4 address) to one body, and thirty an hour to one body from everyone; the signup form five from one network and sixty in total (`form.rate_limited` in Axiom). If that is not enough, turn on Cloudflare's WAF rate limiting for `/_emdash/api/plugins/newsletter/contact` and `/subscribe`, or set Turnstile's widget to "Managed" or "Interactive" in the Turnstile dashboard.

## 6. Scheduled content did not go live

The hourly heartbeat goes only when no entry is still waiting past its scheduled time (`src/worker.ts`). An entry stays waiting when its publish keeps failing: a database error, or a plugin hook that throws. EmDash takes an entry a hook refuses outright back out of the schedule (it shows as a draft with the refusal in the admin), so those do not hold the heartbeat. A waiting entry does not clear itself: someone has to publish it, fix what refuses it, or unschedule it, and the heartbeat stays red until then. To list them (read-only; drop `--remote` and add `--local` against a local copy):

```bash
pnpm wrangler d1 execute DB --env production --remote --command "SELECT 'news' AS collection, id, slug, status, scheduled_at FROM ec_news WHERE scheduled_at IS NOT NULL AND scheduled_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND deleted_at IS NULL UNION ALL SELECT 'events', id, slug, status, scheduled_at FROM ec_events WHERE scheduled_at IS NOT NULL AND scheduled_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND deleted_at IS NULL UNION ALL SELECT 'officers', id, slug, status, scheduled_at FROM ec_officers WHERE scheduled_at IS NOT NULL AND scheduled_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND deleted_at IS NULL UNION ALL SELECT 'bodies', id, slug, status, scheduled_at FROM ec_bodies WHERE scheduled_at IS NOT NULL AND scheduled_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND deleted_at IS NULL UNION ALL SELECT 'pages', id, slug, status, scheduled_at FROM ec_pages WHERE scheduled_at IS NOT NULL AND scheduled_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND deleted_at IS NULL"
```

These are the five collections in `seed/seed.json`; `SELECT slug FROM _emdash_collections` lists them if one is added. A published entry can appear too, with `status` `published`: its scheduled draft is what is waiting. For each row, open the entry in the admin and publish it by hand. If that fails, the admin shows why; the `[scheduled-publish] Failed to publish <collection>/<id>` line in Axiom has the error the cron run met.

## 7. Contacts

| Who | For what | How |
| --- | --- | --- |
| Temple administrators (EmDash Admins) | Decisions, newsletter wording, editor access | Listed in the admin under **Users**, role Admin |
| The site's maintainer | Code, deploys, rollbacks | `<name, phone, email>` (fill in at launch) |
| Cloudflare | Platform outages | cloudflarestatus.com; support from the dashboard |
| Resend | Email outages, deliverability | resend-status.com; support from the dashboard |
| Checkly / Axiom | Monitoring itself | Their status pages |

## 8. Afterwards

Within a week, write down what happened, how it was found, what fixed it and what would have caught it sooner, and add that check (a test, an alert, a Checkly check) rather than only a note.
