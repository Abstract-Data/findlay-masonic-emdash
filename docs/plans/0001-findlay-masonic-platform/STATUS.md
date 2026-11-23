# STATUS — 0001-findlay-masonic-platform
| Field | Value |
|---|---|
| SDD phase | 3 — TASKS |
| State | **M0 agent tasks done; waiting on human tasks and the M0 critic** |
| Last updated | 2026-11-23 |
| Current milestone | M0 — Foundation and toolchain (T0.12, T0.16 human; T0.17 critic pending) |
| Tasks | [TASK.md](TASK.md) |
| ADR | [ADR-001](../../adr/ADR-001-stack-selection.md) — Accepted |

## Milestones
| ID | Milestone | State | Exit check |
|---|---|---|---|
| M0 | Foundation and toolchain | In progress: T0.1–T0.9, T0.13–T0.15 done (CI green, run 45241090879); T0.10, T0.11 built, awaiting PATH_ASK approval; T0.12, T0.16 human; T0.17 critic pending | CI green + staging deploy |
| M1 | Content model and seed | Tasked (T1.1–T1.12) | Collections in admin, FR-9.2 test |
| M2 | Pure core | Not started | Vitest green, 100% branch on acl/recurrence |
| M3 | Auth + body-access | Not started | FR-5 per-role e2e green |
| M4 | Public site | Not started | FR-1/2/3/4/9.1 e2e, axe AA, Lighthouse ≥ 90 |
| M5 | Newsletter plugin | Not started | Staging send to allowlist + test Segment |
| M6 | Content migration | Not started | Inventory resolved, redirects green |
| M7 | Observability + hardening | Not started | Code-devil clean, Checkly 48 h green |
| M8 | Launch | Not started | Production live, lodge sign-off |

## Astro 7 verification (T0.15)
Outcome: **no blocker. Stay on Astro 7.** No Astro 6 fallback needed.

Sources: the Astro docs source at `raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/` (`guides/upgrade-to/v7.mdx`, `guides/integrations-guide/cloudflare.mdx`, `guides/environment-variables.mdx`, `guides/testing.mdx`, `reference/cli-reference.mdx`, `reference/configuration-reference.mdx`), fetched 2026-11-23 because docs.astro.build and astro.build are blocked by the cloud session's proxy. Plus the installed packages (astro 7.4.13, @astrojs/cloudflare 14.4.9) and running this repo.

| Rule (overlay / constitution) | Result | Evidence |
|---|---|---|
| Vite 8 / Rolldown bundling | OK | `pnpm astro build` completes on vite 8.3.8 (Rolldown chunking output); no Vite-specific config beyond `css.lightningcss`. |
| Rust compiler (only compiler in v7) | OK | Template compiles; `astro check` 0 errors. v7 rejects unclosed tags and no longer repairs invalid nesting, so new templates must be valid HTML. |
| Whitespace: `compressHTML` default is now `'jsx'` | Changed | A line break between inline elements renders as nothing; use `{" "}`. Checked after Prettier reformatted every `.astro` file: rendered text of 10 pages (home, posts, 3 posts, search, about, category, tag, 404) is identical to the pre-format build. Rule added to AGENTS.md. |
| `src/fetch.ts` reserved (advanced routing is default) | Changed | New in v7. Never name a module `src/fetch.ts`. Noted in AGENTS.md. |
| Bindings via `locals.runtime.env` (constitution § Platform and stack) | Changed | Removed since Astro 6; adapter 14 throws (`cf-helpers.js`). Use `import { env } from "cloudflare:workers"`, `Astro.request.cf`, global `caches`, `Astro.locals.cfContext`. The constitution line is stale; AGENTS.md has the current rule. |
| `astro:env` server secrets / no secret+client | OK | Schema in `astro.config.mjs` type-checks; Astro rejects `context: "client"` + `access: "secret"` by design. On Cloudflare, `astro:env/server` reads Worker vars and secrets. |
| Cloudflare adapter 14: sessions on KV `SESSION` | OK, with a deploy caveat | Adapter injects `SESSION` unless `wrangler.jsonc` declares it. Each env now declares its own. See Workers Builds note below. |
| Cloudflare adapter 14: Wrangler environments | Changed | The env is chosen at build time with `CLOUDFLARE_ENV`; the build writes a flattened `dist/server/wrangler.json`. `wrangler deploy --env staging` after a plain build silently uses the local bindings (verified with `--dry-run`). Deploy scripts `deploy:staging` / `deploy:production` set `CLOUDFLARE_ENV`. |
| Vitest through `getViteConfig()` | OK, with a workaround | Works with Vitest 5.1.1. The adapter's workerd runner cannot start under Vitest (`depsOptimizer is required in dev mode`), so `astro.config.mjs` drops the adapter when `VITEST` is set. Unit tests target the pure core only, as PLAN already assumes. |
| `astro dev` under an agent | Changed | v7 backgrounds `astro dev` when it detects an AI agent (macOS/Linux). Playwright uses `--ignore-lock` to keep a foreground server it can stop. |
| `astro check` replaces bare `tsc` | OK | `@astrojs/check` 0.9.12 against strict tsconfig: 0 errors. |

## Workers Builds `SESSION` KV failure
The PR's Workers Builds deploy fails with `binding SESSION of type kv_namespace must have a namespace_id specified`. Cause, read from wrangler 4.166 (`provisionBindings` in `wrangler-dist/cli.js`): the adapter adds a `SESSION` binding with no ID, and wrangler's auto-provisioning would create the namespace, but when listing KV namespaces returns a permission error it skips provisioning silently and uploads the binding without an ID. So the Workers Builds API token most likely lacks KV permission (inferred, not seen in the build log). No config-only fix exists that keeps EmDash sign-in working: EmDash stores users in the Astro session, and a different session driver needs other infrastructure. Two human fixes, either works: create the KV namespaces and paste their IDs (T0.12), or grant the Workers Builds token KV edit permission so provisioning runs. Workers Builds should also deploy with `CLOUDFLARE_ENV=staging` (see above); the top level is now local-only with IDs `local` and will not deploy.

## Open human actions
- **T0.10 (PATH_ASK):** approve the `astro:env` schema in `astro.config.mjs` by landing the PR.
- **T0.11 (PATH_ASK):** approve the `wrangler.jsonc` split by landing the PR. Decide whether the existing D1 `findlay-masonic-site` (`e973aaf5-…`) becomes production or is retired; it is no longer bound in any env. Confirm Worker names (`findlay-masonic-emdash-staging`, `findlay-masonic-emdash-production`) and R2 bucket names.
- **astro.config.mjs (PATH_ASK, from T0.7 and T0.8):** two more edits ride on the same PR. The adapter is skipped under Vitest, and dev passes `PORTLESS_URL` to EmDash `siteUrl`.
- **T0.12:** create staging D1, R2 (`findlay-masonic-media-staging`), KV and the Axiom destinations `axiom-staging-logs` / `axiom-staging-traces`; paste the IDs. This also fixes the Workers Builds check, or grant its token KV permission.
- **Workers Builds:** set its build to `CLOUDFLARE_ENV=staging` (or production) before `wrangler deploy`.
- **T0.16:** staging deploy with `pnpm run deploy:staging` (not `wrangler deploy --env staging`; see the Astro 7 table).
- **T1.2:** lodge confirms officer titles (start early; it gates T1.5).
- **Body numbers:** Council No. 50 and Order of the Eastern Star No. 23 come only from `docs/spec/findlay-masonic-platform/brainstorm-intake.md:7` (the intake's description of the live findlaymason.org). `reference/` is the 2023 staging export and does not corroborate them. Pending lodge confirmation.

## Log
- 2026-11-23: Spec brainstorm Phases 0–5 complete (docs/spec/findlay-masonic-platform/). Planning decisions recorded (PLAN §2). Plan drafted.
- 2026-11-23: Plan approved by human. ADR promoted to docs/adr/ADR-001-stack-selection.md (Accepted). Constitution amendment 1 records the PLAN-phase NFRs and staging/production environments. M0 and M1 broken into TASK.md.
- 2026-11-23: M0 agent work for T0.1–T0.11 and T0.13–T0.15 pushed on `claude/happy-bell-oj5yoo`. oxlint/oxfmt pinned one release back because of pnpm's release-age cooldown (receipts log). Astro 7 verified with no blocker. T0.12 and T0.16 wait on a human; T0.17 waits on the critic.
