# Runbook: set up Axiom and Checkly

**Who runs it:** a human with the Temple's Cloudflare, Axiom and Checkly accounts. Agents never create accounts, keys or deploys.
**Result:** each environment's logs and traces reach Axiom, Checkly checks the public site every ten minutes, and a heartbeat alerts when scheduled publishing stops.
**Time:** about an hour, then 48 hours of watching staging (the M7 exit check).

Everything the services run is already in the repository: the log events and queries in [docs/observability/axiom.md](../observability/axiom.md), the checks in `checkly.config.ts` and `checkly/`, and the monitors' tests in `tests/e2e/monitor/`.

## 1. Axiom (once per environment)

1. In Axiom, create two datasets per environment: `findlay-masonic-staging-logs` and `findlay-masonic-staging-traces`, then the same with `production`.
2. Create an Axiom API token that can only ingest into those datasets. Keep it in 1Password; it never goes into the repository.
3. In the Cloudflare dashboard, **Workers & Pages → Observability → Destinations**, add four OTLP destinations, named exactly as `wrangler.jsonc` expects:

   | Destination name | Endpoint | Header |
   | --- | --- | --- |
   | `axiom-staging-logs` | `https://api.axiom.co/v1/logs` | `Authorization: Bearer <token>`, `X-Axiom-Dataset: findlay-masonic-staging-logs` |
   | `axiom-staging-traces` | `https://api.axiom.co/v1/traces` | the token, `X-Axiom-Dataset: findlay-masonic-staging-traces` |
   | `axiom-production-logs` | `https://api.axiom.co/v1/logs` | the token, `X-Axiom-Dataset: findlay-masonic-production-logs` |
   | `axiom-production-traces` | `https://api.axiom.co/v1/traces` | the token, `X-Axiom-Dataset: findlay-masonic-production-traces` |

4. Deploy the environment ([deploy.md](deploy.md)). Open the site, submit nothing, and after a few minutes check that the logs dataset has Cloudflare's invocation records.
5. In Axiom, run the "Site events, parsed" query from `axiom.md`. If it returns nothing after a contact form test on staging, open one record in Axiom's schema view and adjust the field name the queries parse (`body`).
6. Create the dashboard and the four alerts listed in `axiom.md` (errors, form outages and failed email, refusal bursts, P95 over 300 ms). Send alerts to the Temple administrators' inbox.

## 2. Checkly (once, then per environment)

1. Create a Checkly account for the Temple (the free tier covers one Playwright Check Suite every ten minutes from two locations; check the current plan limits).
2. Create a Checkly API key (**User settings → API keys**) and note the account id. Keep both in 1Password.
3. From a checkout of the repository, on a computer, not in CI:

   ```bash
   pnpm install --frozen-lockfile
   export CHECKLY_API_KEY=<from 1Password> CHECKLY_ACCOUNT_ID=<from 1Password>
   ENVIRONMENT_URL=https://<staging address> pnpm exec checkly test --record
   ```

   `checkly test` runs the five `@monitor` checks in Checkly's cloud against staging. All five must pass.
4. Deploy the checks: `pnpm exec checkly deploy`. This creates the Playwright Check Suite "Public site: home, a body, calendar, ICS feed, signup" and the heartbeat "Scheduled publishing (Worker cron)".
5. In Checkly, set the check suite's environment variable `ENVIRONMENT_URL` to the staging address for the 48-hour soak, and to `https://findlaymason.org` after launch (M8). Add an alert channel (email to the Temple administrators).
6. Open the heartbeat, copy its ping URL, and store it as a Worker secret in each environment that should report: `pnpm wrangler secret put CHECKLY_HEARTBEAT_URL --env staging` (then `production` at launch). The URL is a credential: anyone holding it can keep the monitor green.
7. Wait an hour. The heartbeat turns green after the first scheduled run at the top of the hour.

## 3. The 48-hour soak (M7 exit check)

With staging deployed and the checks pointed at it, leave everything running for 48 hours. The exit check passes when the check suite and the heartbeat stayed green the whole time (a failure that a retry cleared counts as green) and Axiom shows no unexplained error. Record the start and end time and the Checkly result link in `docs/plans/0001-findlay-masonic-platform/STATUS.md`.

## Running the monitors without Checkly

`pnpm e2e --grep @monitor` runs the same five checks against the local dev server (the `monitor` project in `playwright.config.ts`). To run them against a deployed site without an account, use the Checkly configuration's Playwright file directly:

```bash
ENVIRONMENT_URL=https://<address> pnpm exec playwright test -c checkly/playwright.config.ts
```
