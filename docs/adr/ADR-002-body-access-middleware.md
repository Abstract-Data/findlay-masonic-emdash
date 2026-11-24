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

- **The policy stays in core.** `authorize(principal, operation)` in `src/lib/core/acl/policy.ts` decides every case, with exhaustive tests (30 operations, 2160 cases) and 100% branch coverage. The hooks and the middleware gather facts, call it and turn its decision into EmDash's response. Neither decides anything itself.
- **The plugin** (`src/plugins/body-access`, native) stores grants (`userId`, `bodyId`) in plugin storage, registers the content and media hooks, serves `grants/list` and `grants/set` (Admin only) and `my-bodies`, and adds the Body Access page and the `body` field widget.
- **The middleware** (`src/middleware.ts`) runs after EmDash's auth middleware. For a signed-in user below Admin it looks up the rule for the route Astro matched (`context.routePattern`) and the method in `ROUTE_TABLE` (`src/lib/adapters/emdash/route-table.ts`). It loads what the rule needs, such as the entry's stored bodies, the revision or the media item, and calls `authorize`. A refusal returns `403 BODY_ACCESS_DENIED` with plain text that names the body. Every request then runs inside an `AsyncLocalStorage` actor store, so `beforeDelete` and `media:beforeUpload` know the user.

### The route table

Every unsafe route EmDash injects is classified. The middleware never guesses from a URL. It keys off the pattern Astro routed to, so its view cannot drift from Astro's routing.

| Rule         | Meaning                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `entry`      | A write to one entry. The rule names the route's `lookup`, and the middleware authorizes the write against the stored bodies of every entry its `[id]` could name. |
| `revision-restore` | Restoring a revision moves the entry to that revision's body, so both bodies are needed.              |
| `upload`, `media-item` | Media decision O1, below.                                                                         |
| `admin-only` | MCP, and EmDash features an Editor has no business using (schema, settings, taxonomies, users, imports). |
| `pass`       | Guarded elsewhere (`hook`), site-wide (`site`), sign-in and own account (`account`), plugin routes (their own permission), writes nothing (`read`), or development only (`dev`). |

**Every entry an `[id]` could name.** EmDash's handlers resolve `[id]` as an id or a slug, trying one and falling back to the other, sometimes in the request's locale and sometimes in none, and some include the trash. A guard that read the entry one way while the handler read it another could authorize one entry and let EmDash write a different one (red team finding 1: a recovery revision reached another body's trashed entry through a slug equal to its id, and through a shared slug in another locale). So each `entry` rule names the route's lookup:

| Lookup  | EmDash's read                       | Routes                                                       |
| ------- | ----------------------------------- | ------------------------------------------------------------ |
| `live`  | `findByIdOrSlug`, outside the trash | PUT and DELETE, duplicate, discard, lock, room, terms, unschedule, unpublish, plugin extensions |
| `trash` | `findByIdOrSlugIncludingTrashed`    | restore, recovery revisions                                  |
| `id`    | the id alone, trash included        | clearing a scheduled-publish rejection                       |

For `live` and `trash` the middleware reads the entry by id, by slug with no locale, and by slug in the request's locale, and authorizes the write against every entry it finds. A revision restore checks every entry its revision's entry id could name the same way. `tests/unit/route-table.test.ts` reads each route's handler in `node_modules/emdash` and fails when a rule's lookup is missing or differs from the call EmDash makes, or when EmDash starts resolving an entry route with a function it does not know.

**Slugs that look like ids.** As defense in depth, the middleware refuses a save below Admin whose slug matches EmDash's own id test (`/^[0-9A-Z]{26}$/`) with `422 INVALID_SLUG` and a plain reason. It reads the slug from the JSON body of the routes whose body can set one (`SAVE_ROUTES`: create, PUT and recovery revisions). The route-table test derives that list from EmDash's request schemas.

**Pending drafts are read strictly.** The middleware reads each entry and its draft revision through EmDash's repositories. An entry whose pending draft cannot be read is refused, never judged by its live body alone (red team finding 7). The hooks read drafts the same way. A media item that cannot be read is refused too; only a missing item passes to EmDash, which answers 404 (finding 5).

**Lookups keyed by request input use a Map.** `COLLECTION_SCOPES` and `ROUTE_TABLE` are Maps, and a method is matched with `Object.hasOwn`, so a collection named `constructor` is unlisted rather than a scope inherited from `Object` (finding 2).

**Fail closed.** An unsafe request to an `/_emdash` route the table does not list is Admin-only. `tests/unit/route-table.test.ts` reads `node_modules/emdash/src/astro/integration/routes.ts` and every route file. It fails when EmDash adds an unsafe route the table does not classify, or when the table lists one that no longer exists. Upgrading EmDash therefore fails a unit test before it can open a hole.

**Collections.** `entries.ts` classifies each collection. `officers`, `events` and `news` belong to their `body` field. A `bodies` entry belongs to itself, so editors maintain their own body's page. Only an Admin adds a body, or trashes, unpublishes or schedules a body's page, because an editor who did so would lock their peers out ("not one of the Temple's bodies") and take the page offline (red team finding 4, coordinator decision). Core rules on this as a `body-page` operation, and a save that sets the page's `status` counts as an unpublish. `pages` are site-wide. A collection missing from the table is Admin-only. A unit test fails when the seed has a collection the table does not classify.

**Live and draft bodies.** An unpublished draft can name a different body from the live entry. Every check uses the entry's *stored bodies*, its live body then its draft's body, so an editor cannot publish, unpublish, trash or edit an entry that a draft has moved into, or out of, a body they do not hold. EmDash hands `content:beforeUnpublish` the live entry only, so the middleware now guards unpublish as an `entry` rule, and every policy hook reads the entry and its draft itself (red team finding 3).

**Who a hook acts for.** A hook acts for the event's actor, or else for the signed-in user of the request it runs in, read from the actor store. A plugin that writes content on a user's behalf is therefore held to that user's grants. Only a write outside any signed-in request, such as a scheduled publish, a seed or a system write, is internal (policy D2). Policy events from the scheduler or the system are internal whatever request they run in (red team finding 6).

**Translations stay in one body.** A translation joins its source's translation group, and must belong to the source's body (`checkTranslationBody` in core). EmDash's only group-wide write, copying non-translatable fields to every translation, runs only when Astro i18n configures two or more locales. This site configures none, and `tests/unit/translations.test.ts` fails if `astro.config.mjs` gains an `i18n` block (red team finding 8, residual risk 7).

### Media default (open decision O1)

- An upload needs at least one body grant (or Admin).
- Changing, replacing or deleting a media item needs its uploader (or Admin). A provider's item records no uploader, so it is Admin-only.

This default is reversible. It costs editors nothing for their own files, and it stops one body's editor from replacing another body's emblem. The operator can relax it to "any editor with a grant" by changing one rule in the route table.

**Identical files.** EmDash deduplicates uploads by content hash. When a second body's editor uploads bytes the library already holds, EmDash returns the existing item, which stays its first uploader's. The second editor can use it in their content, but cannot edit its alt text or delete it. This is not an escalation: nobody gains a write. Decision: keep EmDash's deduplication, and say why at the point an editor meets it. The `not-uploader` refusal now ends "If you uploaded an identical file, the library kept the copy of whoever first uploaded it. You can still use it in your content." Making each body keep its own copy would mean rewriting the upload request below EmDash, for a rare case whose only cost is an alt text an Admin can change.

### MCP

MCP is Admin-only. An Editor's valid bearer token is refused with `403 BODY_ACCESS_DENIED` ("cannot use the MCP endpoint"). MCP's tools reach content through paths this guard would otherwise have to re-derive, and no body editor needs MCP. Admins keep it.

### Structural guards (lessons encoded as tests)

- `tests/unit/plugins/body-access.test.ts` pins the plugin's capabilities and builds EmDash's `HookPipeline` from the real plugin. It fails if any guard hook is skipped. A misspelt capability throws, and a valid but wrong one is a silent skip. The M3 capability regression showed the test catches both.
- `tests/unit/route-table.test.ts`, above: unclassified routes, stale rows, each entry rule's lookup against its EmDash handler, and the save routes against EmDash's request schemas.
- `tests/unit/adapters/emdash/request-guard.test.ts` drives `guardRequest` over fake EmDash reads: every entry an `[id]` could name, unreadable drafts and media, id-like slugs, body pages. `tests/unit/plugins/hooks.test.ts` drives the hooks over a fake plugin context: the request actor, drafts, body pages, translations.
- `tests/e2e/body-access/` proves FR-5 role by role, with one test per guarded route and one per red-team finding.

## Accepted residual risks

These stand until a new ADR replaces them (constitution § Per-body access control). The lodge signs them off before launch (PLAN Q14).

1. **Read isolation.** Editors can read other bodies' unpublished drafts in the admin.
2. **Site-wide content.** Editors can edit menus, widgets, sections, bylines, media folders, comments and the static `pages`.
3. **Development sign-in.** The e2e suites sign in through EmDash's development-only bypass. Production sign-in (invites, passkeys, Google and Microsoft) is not exercised by automated tests. A human checks it on staging (STATUS.md open actions).
4. **Bearer tokens.** An Editor can mint their own OAuth bearer token without an Admin, through public dynamic client registration and the device flow (`/_emdash/api/oauth/register`, `/oauth/device/code`, `/oauth/device/authorize`, `/oauth/token`). This is not a bypass. EmDash clamps the token's scopes to the user's role, and EmDash's auth resolves the token to the real user, so the middleware judges it as that Editor and reads their grants afresh on every request. `mcp.spec.ts` shows a self-minted Editor token writing the Editor's own body, and refused another body's entry and MCP. API tokens bound to no user can be created only by an Admin; such a token passes the middleware as an anonymous request, and EmDash's own permission check then applies. Whatever the token, a page answered to a request that carries `Authorization` is never stored in Cloudflare's cache, where the next visitor would get it: the middleware and `src/worker.ts` mark it `private, no-store` (M7 review L1).
5. **One module instance.** The actor store relies on one `AsyncLocalStorage` per isolate, shared through `globalThis`. The M3 evidence shows it working in `astro dev` and in the production build under `wrangler dev`. A bundling change that loads two Node async-hooks implementations would blind the backstop hooks, though not the middleware. On a Node host, a timer armed inside a signed-in request would carry that request's actor into later work; Cloudflare runs scheduled work from its own `scheduled()` handler, and policy events from the scheduler are internal whatever store they see.
6. **Co-editor accounts that are gone.** A co-editor whose account was deleted counts as a non-admin with their stored grants. Their edits in a draft can block a save until an Admin discards the draft.
7. **Translation groups when i18n is on.** A new translation must join its source's body, but a later move of one translation, or a revision restore, can still leave a group across two bodies. That matters only when Astro i18n configures two or more locales, the one case where EmDash copies non-translatable fields across a group. `tests/unit/translations.test.ts` fails the moment `astro.config.mjs` gains an `i18n` block, so the guard has to cover group-wide writes before i18n can ship.
8. **Refusals by slug.** Because the middleware checks every entry an `[id]` could name, an Editor who addresses their own entry by a slug that another body's entry also holds (in another locale, or in the trash on a trash route) is refused. The admin addresses entries by id, so only hand-written API calls meet this; the reason names the other body.
9. **Id-shaped slugs an Admin stores.** Admins skip the middleware, so an Admin can still save a slug that looks like an id. The guard checks every entry such a slug could reach, so it cannot redirect an Editor's write, but it can cause the refusal in risk 8. An Editor cannot get one live through a co-editing room either: a room's checkpoint saves past the middleware, and EmDash stages its slug on the draft (`_slug`) after `content:beforeSave` runs, so `beforePublish` and `beforeSchedule` refuse an Editor's draft whose staged slug looks like an id (M7, parked item d).
10. **Search shows news of an unpublished body.** EmDash's `/_emdash/api/search` returns every published entry and offers no hook or filter, so a published news item whose body page is unpublished still appears in search, with its title and snippet; its page answers 404. The sitemap leaves such items out (`src/pages/sitemap-[collection].xml.ts`, M4 verification N3). An Admin who retires a body should unpublish its news too. Revisit if EmDash adds a search filter.

## Consequences

- An Editor's write to an entry costs up to three entry reads (by id, by slug, by slug in the request's locale), one draft read per entry found, and the grants. Admin requests skip the middleware's lookups.
- Each EmDash upgrade must keep `tests/unit/route-table.test.ts` green. A new unsafe route gets a rule, or stays Admin-only, and a route whose handler changes how it finds its entry fails until its lookup is reclassified.
- The red team review of M3 (feb8594) found eight issues. Findings 1 to 5 are fixed, 6 to 8 are closed as described above, and each has a test that failed before its fix (TASK.md § M3 red-team fixes).
- The policy can grow, for example with scoped Admins or read isolation, by adding operations to core without touching the plugin's wiring.

## Alternatives considered

- **Hooks only.** Rejected, for the reasons above.
- **Disable MCP (`mcp: false`).** Simpler, but it takes MCP from Admins too. The middleware denial keeps it for them.
- **Option C, separate sites or scoped permissions upstream.** One site per body loses the shared calendar and newsletter. Scoped permissions do not exist in EmDash 1.6. Revisit if EmDash adds them.
