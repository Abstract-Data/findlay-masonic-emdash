# Runbook: deploy staging and production

**Who runs it:** a human with deploy rights on the Temple's Cloudflare account. Agents never deploy (constitution § Data integrity and operations).
**Result:** a new version of the Worker serves the environment, with its own D1, R2 and KV.
**Time:** ten minutes, plus the checks.

## The gates

| Gate | Who | Before |
| --- | --- | --- |
| The pull request is merged to `main`, with CI green on both Node legs | Reviewer | every deploy |
| PATH_ASK changes (`astro.config.mjs`, `seed/seed.json`) were approved by landing their PR | Human | every deploy that carries one |
| Staging ran the change, and the `@monitor` checks passed against it | Human | every production deploy |
| The lodge signed off on the residual risks (ADR-002) | Lodge | the first production deploy (M8) |

## Once per environment

1. Resources exist and their ids are in `wrangler.jsonc` (T0.12 staging, T8.0 production): D1, R2 bucket, KV namespace.
2. Secrets are set from 1Password, per environment, with `pnpm wrangler secret put <NAME> --env <staging|production>`: `RESEND_API_KEY`, `TURNSTILE_SECRET`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_SECRET`, `CHECKLY_HEARTBEAT_URL`.
3. Variables are filled in the environment's `vars` in `wrangler.jsonc` and committed: `SITE_ENV` (already `staging` or `production`), `RESEND_FROM`, `RESEND_SEGMENT_ID`, `RESEND_NEWSLETTER_TOPIC_ID`, `NEWSLETTER_TEST_ALLOWLIST`, `TURNSTILE_SITE_KEY`. A deploy replaces dashboard values with these.
4. The Axiom destinations exist ([monitoring-setup.md](monitoring-setup.md)).

`SITE_ENV` matters: only `production` lets the site email anyone. On staging, and anywhere it is missing or misspelt, invites, sign-in links, contact messages and test sends reach only `NEWSLETTER_TEST_ALLOWLIST` and Resend's `@resend.dev` test inboxes, the signup form adds only those addresses to Resend, and a Broadcast is created or sent only when every contact in its Segment is one of them. Anything else is refused and logged as `email.blocked`.

## Deploy

From a clean checkout of `main`:

```bash
pnpm install --frozen-lockfile
pnpm run deploy:staging      # CLOUDFLARE_ENV=staging astro build && wrangler deploy
```

For production, the same with `pnpm run deploy:production`. Never run `wrangler deploy --env staging` after a plain build: the adapter picks the environment at build time from `CLOUDFLARE_ENV`, so that deploys the local bindings.

Note the version id Wrangler prints; [incident.md](incident.md) rolls back to an earlier one.

## Check

1. The home page, a body page, `/calendar`, `/calendar.ics` and `/newsletters` load. Checkly does this every ten minutes once it is set up; to run the same checks by hand: `ENVIRONMENT_URL=https://<address> pnpm exec playwright test -c checkly/playwright.config.ts`.
2. `/_emdash/admin` loads and an Admin can sign in.
3. A response for a visitor carries `Cloudflare-CDN-Cache-Control: public, max-age=...`; with `curl -sI https://<address>/` the header is there. A signed-in Admin's responses carry `Cache-Control: private, no-store`, and so does the answer to `curl -sI -H "Authorization: Bearer x" https://<address>/`: Cloudflare would store a `public` answer to a request with credentials, so the Worker marks it private, and any response that sets a cookie too (`src/worker.ts`).
4. In Axiom, the environment's logs dataset received records in the last five minutes.
5. **Publishing purges the cache (first staging deploy, and after any change to caching).** `wrangler dev` has no Workers cache, so this is checked only on Cloudflare. Run `curl -sI https://<address>/news` twice: the second answer carries `cf-cache-status: HIT`. In the admin, change a published news item's title and publish it. Run the same `curl` again: `cf-cache-status: MISS`, and the page shows the new title. Then schedule an edit to go live two minutes ahead, wait three, and check the same. In Axiom, the "Scheduled work and cache purges" query shows no `cache.purge_failed` for those minutes. If it does, the pages still expire on their own (an hour at most), and the line's `error` says why (Cloudflare limits purges to its Free tier rate for a Worker's cache).

## After a schema change (PATH_ASK)

EmDash applies its own migrations on the first request. A change to `seed/seed.json` does not reach an existing database: apply it in the admin as the PR describes (for example a field's widget), then check the collection in the admin.

## Cache

Public pages and feeds are cached in the Worker's own cache at Cloudflare's edge (`astro.config.mjs` `cache`, `src/lib/adapters/site/cache.ts`): content pages for an hour, pages that show what comes next for fifteen minutes, the newsletter archive for five. Publishing in EmDash, by hand or on schedule, purges the affected pages; a purge that fails is logged as `cache.purge_failed` and the pages expire on their own.

**A deploy starts from an empty cache.** Cloudflare keys a Worker's cache by the Worker version unless `cache.cross_version_cache` is set (developers.cloudflare.com/workers/cache/cache-keys, "Invalidating cache across deployments"), and the build writes `cache: { enabled: true }` without it, so no page cached by the previous version, which may name `/_astro/*` files the new deploy removed, is served after a deploy. Keep it that way: `tests/build/check-cache-headers.mjs` fails a build whose `wrangler.json` turns `cross_version_cache` on. Should it ever be wanted, each deploy must then purge everything from inside the Worker.

**Purging by hand.** The dashboard's **Caching → Purge Cache** and the zone purge API do not touch a Worker's cache (developers.cloudflare.com/workers/cache/purge); only the Worker can purge it. To clear every page now, deploy again: the new version starts empty. Otherwise a page is replaced within its expiry. After a rollback ([incident.md](incident.md)), the earlier version may still hold copies it cached while it was live, an hour old at most.
