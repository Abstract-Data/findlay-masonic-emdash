# ADR-002: Body access through a plugin and request middleware

| Field      | Value                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| Status     | Proposed. Accepted when the M3 pull request lands (its `astro.config.mjs` and `seed/seed.json` changes are PATH_ASK). |
| Date       | 2026-11-23                                                                                                |
| Milestone  | M3, Authentication and the `body-access` plugin                                                           |
| Supersedes | Nothing. Refines ADR-001's choice of a native plugin for per-body access.                                 |

## Context

Six Masonic bodies share one EmDash site. Each body's editors must be able to write only their own body's officers, events, news and media (spec FR-5, constitution § Per-body access control). EmDash 1.6 knows roles, not bodies. An **Editor** (role 40) may edit, publish and delete any entry, so the body boundary has to be added.

The constitution's first answer was hooks: a native plugin registering `content:beforeSave`, `beforeDelete`, `beforePublish`, `beforeUnpublish` and `beforeSchedule`. Research against EmDash 1.6.0 (the probe recorded in STATUS.md's M3 log) showed hooks alone cannot meet FR-5.

## Why hooks alone are not enough

1. **Writes no hook sees.** These EmDash API routes change an entry without running any content hook: a `PUT` without `data` (slug, status, `publishedAt`, bylines, SEO, terms, references), restore from the trash, duplicate, discard a draft, unschedule, revision restore, recovery revisions, edit locks, co-editing room joins, term assignment, plugin editor extensions and clearing a scheduled-publish rejection. The probe used the data-less `PUT` to unpublish and re-slug another body's published entry. The M3 bypass regression reproduces it (STATUS.md).
2. **Hooks that know no actor.** `content:beforeDelete` and `media:beforeUpload` receive no user. A hook can only refuse a trash with a bare `DELETE_BLOCKED`, and an upload with a generic 500.
3. **MCP.** `/_emdash/api/mcp` is on by default. It reaches content through its own tools, and a valid Editor token is enough to call it.
4. **Media has no body.** A media item records its uploader, not a body, so no content hook can say whose it is.
5. **Silent skips.** EmDash registers a hook only if the plugin holds the capability that hook needs. Otherwise it logs a warning and drops the hook, so a misspelt capability turns the guard off with no error.
6. **Upgrades add routes.** Each EmDash release can add a write route that no table of hooks knows about.

## Decision

Body access has two callers of one policy:

```
request ─▶ EmDash auth (pre) ─▶ src/middleware.ts ─▶ EmDash route ─▶ body-access hooks
                                  │ route table                      │ beforeSave, publish,
                                  │ + stored bodies                  │ delete, upload
                                  ▼                                  ▼
                       authorize() in src/lib/core/acl ◀────────────┘
```

- **The policy stays in core.** `authorize(principal, operation)` in `src/lib/core/acl/policy.ts` decides every case, with exhaustive tests (22 operations, 1584 cases) and 100% branch coverage. The hooks and the middleware gather facts, call it and turn its decision into EmDash's response. Neither decides anything itself.
- **The plugin** (`src/plugins/body-access`, native) stores grants (`userId`, `bodyId`) in plugin storage, registers the content and media hooks, serves `grants/list` and `grants/set` (Admin only) and `my-bodies`, and adds the Body Access page and the `body` field widget.
- **The middleware** (`src/middleware.ts`) runs after EmDash's auth middleware. For a signed-in user below Admin it looks up the rule for the route Astro matched (`context.routePattern`) and the method in `ROUTE_TABLE` (`src/lib/adapters/emdash/route-table.ts`). It loads what the rule needs, such as the entry's stored bodies, the revision or the media item, and calls `authorize`. A refusal returns `403 BODY_ACCESS_DENIED` with plain text that names the body. Every request then runs inside an `AsyncLocalStorage` actor store, so `beforeDelete` and `media:beforeUpload` know the user.

### The route table

Every unsafe route EmDash injects is classified. The middleware never guesses from a URL. It keys off the pattern Astro routed to, so its view cannot drift from Astro's routing.

| Rule         | Meaning                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `entry`      | A write to one entry. The middleware authorizes it against the entry's stored bodies.                       |
| `revision-restore` | Restoring a revision moves the entry to that revision's body, so both bodies are needed.              |
| `upload`, `media-item` | Media decision O1, below.                                                                         |
| `admin-only` | MCP, and EmDash features an Editor has no business using (schema, settings, taxonomies, users, imports). |
| `pass`       | Guarded elsewhere (`hook`), site-wide (`site`), sign-in and own account (`account`), plugin routes (their own permission), writes nothing (`read`), or development only (`dev`). |

**Fail closed.** An unsafe request to an `/_emdash` route the table does not list is Admin-only. `tests/unit/route-table.test.ts` reads `node_modules/emdash/src/astro/integration/routes.ts` and every route file. It fails when EmDash adds an unsafe route the table does not classify, or when the table lists one that no longer exists. Upgrading EmDash therefore fails a unit test before it can open a hole.

**Collections.** `entries.ts` classifies each collection. `officers`, `events` and `news` belong to their `body` field. A `bodies` entry belongs to itself, so editors maintain their own body's page, and only an Admin adds a body. `pages` are site-wide. A collection missing from the table is Admin-only. A unit test fails when the seed has a collection the table does not classify.

**Live and draft bodies.** An unpublished draft can name a different body from the live entry. Every check uses the entry's *stored bodies*, its live body then its draft's body, so an editor cannot publish, trash or edit an entry that a draft has moved into, or out of, a body they do not hold.

### Media default (open decision O1)

- An upload needs at least one body grant (or Admin).
- Changing, replacing or deleting a media item needs its uploader (or Admin). A provider's item records no uploader, so it is Admin-only.

This default is reversible. It costs editors nothing for their own files, and it stops one body's editor from replacing another body's emblem. The operator can relax it to "any editor with a grant" by changing one rule in the route table.

### MCP

MCP is Admin-only. An Editor's valid bearer token is refused with `403 BODY_ACCESS_DENIED` ("cannot use the MCP endpoint"). MCP's tools reach content through paths this guard would otherwise have to re-derive, and no body editor needs MCP. Admins keep it.

### Structural guards (lessons encoded as tests)

- `tests/unit/plugins/body-access.test.ts` pins the plugin's capabilities and builds EmDash's `HookPipeline` from the real plugin. It fails if any guard hook is skipped. A misspelt capability throws, and a valid but wrong one is a silent skip. The M3 capability regression showed the test catches both.
- `tests/unit/route-table.test.ts`, above.
- `tests/e2e/body-access/` proves FR-5 role by role, with one test per guarded route.

## Accepted residual risks

These stand until a new ADR replaces them (constitution § Per-body access control). The lodge signs them off before launch (PLAN Q14).

1. **Read isolation.** Editors can read other bodies' unpublished drafts in the admin.
2. **Site-wide content.** Editors can edit menus, widgets, sections, bylines, media folders, comments and the static `pages`.
3. **Development sign-in.** The e2e suites sign in through EmDash's development-only bypass. Production sign-in (invites, passkeys, Google and Microsoft) is not exercised by automated tests. A human checks it on staging (STATUS.md open actions).
4. **Machine tokens without a user.** EmDash only lets an Admin create API tokens. A token bound to no user passes the middleware as an anonymous request, and EmDash's own permission check then applies.
5. **One module instance.** The actor store relies on one `AsyncLocalStorage` per isolate, shared through `globalThis`. The M3 evidence shows it working in `astro dev` and in the production build under `wrangler dev`. A bundling change that loads two Node async-hooks implementations would blind the two backstop hooks, though not the middleware.
6. **Co-editor accounts that are gone.** A co-editor whose account was deleted counts as a non-admin with their stored grants. Their edits in a draft can block a save until an Admin discards the draft.

## Consequences

- An Editor's write costs one or two extra reads (the entry, its draft revision, the grants). Admin requests skip the middleware's lookups.
- Each EmDash upgrade must keep `tests/unit/route-table.test.ts` green. A new unsafe route gets a rule, or stays Admin-only.
- The policy can grow, for example with scoped Admins or read isolation, by adding operations to core without touching the plugin's wiring.

## Alternatives considered

- **Hooks only.** Rejected, for the reasons above.
- **Disable MCP (`mcp: false`).** Simpler, but it takes MCP from Admins too. The middleware denial keeps it for them.
- **Option C, separate sites or scoped permissions upstream.** One site per body loses the shared calendar and newsletter. Scoped permissions do not exist in EmDash 1.6. Revisit if EmDash adds them.
