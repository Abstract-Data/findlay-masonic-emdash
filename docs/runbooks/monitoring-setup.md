# Runbook: set up monitoring in Cloudflare

**Who runs it:** a human with the Temple's Cloudflare account. Agents never create alerts, keys or deploys.
**Result:** each environment's logs and traces are kept in Workers Logs, failures email the Temple administrators, and a burst of refusals or rate limits raises an alert.
**Time:** about twenty minutes per environment, then 48 hours of watching staging (the M7 exit check).

Cloudflare's own tools are the only monitoring this project uses: Workers Logs and Traces, Workers Issues, Monitors, and optionally a Custom Dashboard. The events, filters and alert thresholds are in [docs/observability/workers-logs.md](../observability/workers-logs.md).

## 1. Logs and traces (nothing to do)

`wrangler.jsonc` turns on Workers Logs (with invocation logs) and Workers Traces in both environments, with query strings redacted. A deploy applies it. After the first deploy, open **Workers & Pages → the Worker → Observability**, load a page of the site, and check that the request appears within a minute.

## 2. Alerts (once per environment)

1. **Workers Issues.** In the Worker's **Observability → Issues**, turn Issues on. Add an automation that emails the Temple administrators with an occurrence threshold of `1`, so the first error of each kind notifies, and a recurrence trigger, so an issue that returns after going quiet notifies again.
2. **Monitors.** In **Notifications → Monitors**, create two threshold monitors on the Workers Logs dataset of this Worker, each emailing the administrators:
   - `event` = `body_access.refused`: more than 20 in an hour.
   - `event` = `form.rate_limited`: more than 10 in an hour.
3. **Saved queries.** In the Query Builder, save the queries in `workers-logs.md` § Finding things, so whoever is on call starts from them.
4. Optional: build the Custom Dashboard described in `workers-logs.md` § Dashboard.

## 3. Check what is recorded (first staging deploy)

1. Open one invocation log and one trace of a request with a query string (a calendar page with `?month=`): the URL should end at the path.
2. Submit the contact form once with an allowlisted address, then search the logs for `@` followed by your test inbox's domain. Nothing should match except `[email]`.

## 4. The 48-hour soak (M7 exit check)

With staging deployed, leave it running for 48 hours, using it as editors would: publish something, schedule something an hour ahead, send a test newsletter. The exit check passes when Workers Issues shows no unexplained issue and the scheduled entry went live on time (no `scheduler.overdue`). Run the post-deploy checks at the start and the end:

```bash
ENVIRONMENT_URL=https://<staging address> pnpm exec playwright test -c tests/e2e/monitor/deployed.config.ts
```

Record the start and end time and the result in `docs/plans/0001-findlay-masonic-platform/STATUS.md`.

## What is not covered

Cloudflare has no check from outside that the site answers. A Worker that throws shows up as `5xx` responses and failed invocations in Issues; a site no one visits, or a cron that stops firing, shows nothing at all. Run the post-deploy checks after each deploy, and look at the Worker's **Metrics** tab now and then: the cron's invocations should appear every minute.
