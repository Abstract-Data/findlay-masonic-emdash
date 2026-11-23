# STATUS — 0001-findlay-masonic-platform
| Field | Value |
|---|---|
| SDD phase | 3 — TASKS |
| State | **Plan approved; M0 and M1 tasked** |
| Last updated | 2026-11-23 |
| Current milestone | M0 — Foundation and toolchain (ready to start) |
| Tasks | [TASK.md](TASK.md) |
| ADR | [ADR-001](../../adr/ADR-001-stack-selection.md) — Accepted |

## Milestones
| ID | Milestone | State | Exit check |
|---|---|---|---|
| M0 | Foundation and toolchain | Tasked (T0.1–T0.17) | CI green + staging deploy |
| M1 | Content model and seed | Tasked (T1.1–T1.12) | Collections in admin, FR-9.2 test |
| M2 | Pure core | Not started | Vitest green, 100% branch on acl/recurrence |
| M3 | Auth + body-access | Not started | FR-5 per-role e2e green |
| M4 | Public site | Not started | FR-1/2/3/4/9.1 e2e, axe AA, Lighthouse ≥ 90 |
| M5 | Newsletter plugin | Not started | Staging send to allowlist + test Segment |
| M6 | Content migration | Not started | Inventory resolved, redirects green |
| M7 | Observability + hardening | Not started | Code-devil clean, Checkly 48 h green |
| M8 | Launch | Not started | Production live, lodge sign-off |

## Open human actions
- T0.10, T0.11: review the `astro:env` and Wrangler-environment PRs (PATH_ASK); decide whether the existing D1 `findlay-masonic-site` becomes production.
- T0.12: create staging D1/R2/KV and Axiom destinations.
- T1.2: lodge confirms officer titles (start early — it gates T1.5).

## Log
- 2026-11-23: Spec brainstorm Phases 0–5 complete (docs/spec/findlay-masonic-platform/). Planning decisions recorded (PLAN §2). Plan drafted.
- 2026-11-23: Plan approved by human. ADR promoted to docs/adr/ADR-001-stack-selection.md (Accepted). Constitution amendment 1 records the PLAN-phase NFRs and staging/production environments. M0 and M1 broken into TASK.md.
