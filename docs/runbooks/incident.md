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
| The heartbeat alert fired | Medium | The cron stopped or EmDash's scheduled run throws, so scheduled publishes are not running. Step 2: look for `scheduler.failed` and the "Scheduled work" query in `axiom.md`, then roll back if a deploy caused it. The heartbeat stays green while one publish step fails inside a run; the `[scheduled-publish]` alert covers that |

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

Rollback changes the code only. D1 data, R2 media, KV sessions and secrets stay as they are, and a migration the bad version applied is not undone. Then check the site as in [deploy.md](deploy.md) § Check. Fix forward on a branch; the next deploy replaces the rolled-back version.

## 4. Stop newsletter sends

Sends need an Admin's approval, so nothing new goes out unless someone approves. To stop sending entirely:

1. **A scheduled Broadcast that has not gone yet:** in the Resend dashboard, **Broadcasts**, open the one named `fm-issue:<issue id>:rev:<version>` and cancel it. The site's issue keeps showing **Scheduled**; discard or re-approve it later.
2. **Block all email from the site:** in the Resend dashboard, revoke the API key the Worker uses (**API Keys**). Every send fails at once, and the admin page says Resend refused it. Invites then show their links instead of emailing them only after the next deploy without `RESEND_API_KEY`; until then they fail. To restore, create a new key and `pnpm wrangler secret put RESEND_API_KEY --env production`.
3. **Block only non-allowlisted email:** set `SITE_ENV` to `staging` in `env.production.vars` in `wrangler.jsonc` and deploy. Every email then goes only to `NEWSLETTER_TEST_ALLOWLIST`, the signup form takes no new subscribers, and the site refuses to create or send a Broadcast to a Segment that holds anyone off the list. A Broadcast Resend already holds as scheduled is not the site's to stop, so also do step 1 for those.

If a newsletter reached subscribers by mistake, do not send a correction straight away. Tell the Temple administrators, agree the wording, then send it as a normal issue.

## 5. A form is being abused

The contact form takes five messages an hour from one network (an IPv6 /64 or an IPv4 address) to one body, and thirty an hour to one body from everyone; the signup form five from one network and sixty in total (`form.rate_limited` in Axiom). If that is not enough, turn on Cloudflare's WAF rate limiting for `/_emdash/api/plugins/newsletter/contact` and `/subscribe`, or set Turnstile's widget to "Managed" or "Interactive" in the Turnstile dashboard.

## 6. Contacts

| Who | For what | How |
| --- | --- | --- |
| Temple administrators (EmDash Admins) | Decisions, newsletter wording, editor access | Listed in the admin under **Users**, role Admin |
| The site's maintainer | Code, deploys, rollbacks | `<name, phone, email>` (fill in at launch) |
| Cloudflare | Platform outages | cloudflarestatus.com; support from the dashboard |
| Resend | Email outages, deliverability | resend-status.com; support from the dashboard |
| Checkly / Axiom | Monitoring itself | Their status pages |

## 7. Afterwards

Within a week, write down what happened, how it was found, what fixed it and what would have caught it sooner, and add that check (a test, an alert, a Checkly check) rather than only a note.
