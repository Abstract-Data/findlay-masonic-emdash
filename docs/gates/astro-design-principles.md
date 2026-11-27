# Design principles gates

The constitution's Definition of Done names two gates: the **Astro Design Principles Gate (A1–A12)** and the **TypeScript Design Principles Gate**. Their source text was never committed, so this file restates them from the constitution (§ Platform and stack, § Secrets and configuration, § Frontend, § Per-body access control) and AGENTS.md § Rules. Where a rule here and the constitution disagree, the constitution wins.

Run the gates on every milestone's touched files and record the result in STATUS.md: each rule as pass, fail (with the file and line) or n/a.

## Astro Design Principles Gate (A1–A12)

Applies to touched `*.astro`, `src/pages/**/*.ts`, `src/middleware.ts`, `src/worker.ts` and config files (`astro.config.*`, `wrangler.jsonc`, `tsconfig.json`, lint and test configs).

| ID  | Rule                                                                                                                                                                                | Check                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A1  | Content pages are server-rendered: `output: "server"`, no `getStaticPaths()` or `prerender = true` for CMS content.                                                                 | `grep -rn "getStaticPaths\|prerender" src`                                             |
| A2  | No blanket `client:load` and no page-level island. Hydrate only interactive widgets with `client:visible` or `client:idle`.                                                         | `grep -rn "client:" src`                                                               |
| A3  | No `set:html`. CMS rich text renders through EmDash's `PortableText`.                                                                                                               | `pnpm lint` (`astro/no-set-html-directive`)                                            |
| A4  | No inline `<script>` without `src`, except `is:inline src` for pre-paint scripts. Client code lives in `src/scripts/*.ts`.                                                          | `pnpm lint` (`astro/no-unsafe-inline-scripts`)                                         |
| A5  | Server-only SDKs (`resend`, D1 access, secret-bearing modules) never reach a client component, island or the React admin bundle.                                                    | Imports in `client:*` components and `src/scripts/**`                                  |
| A6  | Configuration is read through `astro:env`. No field is both `access: "secret"` and `context: "client"`. No secret value is committed.                                              | `astro.config.mjs` schema; `.dev.vars.example` has names only                          |
| A7  | Bindings are read with `import { env } from "cloudflare:workers"`, never `Astro.locals.runtime` (removed in Astro 6).                                                               | `grep -rn "locals.runtime" src plugins`                                                |
| A8  | Runtime code uses Web-standard and Workers APIs only; no Node-only (`node:fs`, `process.env`) or Bun APIs outside build-time config and tests.                                      | `grep -rn "node:\|process.env" src plugins`                                            |
| A9  | Cached routes pass content-query cache hints to `Astro.cache.set()`, and site settings, menus, taxonomies and widget areas use the `WithCacheHint` variants.                       | Each `getEmDash*` call in a page                                                       |
| A10 | Image fields render through `<Image image={...} />` from `emdash/ui`; URLs use `entry.id` (slug), API calls use `entry.data.id` (ULID).                                             | Template review                                                                        |
| A11 | Templates are valid HTML for Astro 7's Rust compiler, and a space between inline elements is written `{" "}` (`compressHTML: "jsx"`). `src/fetch.ts` is never used as a module name. | `pnpm astro check`, `pnpm astro build`                                                 |
| A12 | No numeric localhost port in docs or config; dev runs through portless at a named `.localhost` URL.                                                                                 | `grep -rnE "localhost:[0-9]+" --exclude-dir=node_modules --exclude-dir=reference .`   |

## TypeScript Design Principles Gate (T1–T8)

Applies to touched `src/lib/**` and plugin `.ts`/`.tsx` files.

| ID  | Rule                                                                                                                                      | Check                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| T1  | Strict mode holds: `pnpm astro check` reports 0 errors under `astro/tsconfigs/strict` with `noUncheckedIndexedAccess`.                   | `pnpm astro check`                                        |
| T2  | No `any`, no unchecked `as` casts from `any`, no `@ts-ignore` or `@ts-expect-error` without a reason.                                    | `pnpm lint` (`no-unsafe-type-assertion`), grep `@ts-`     |
| T3  | `src/lib/core` is pure: no I/O, no clock reads, no EmDash, Workers or Resend imports. Time comes in as a parameter.                      | Imports in `src/lib/core/**`                              |
| T4  | Adapters in `src/lib/adapters` are the only boundary to EmDash, Resend and the clock. They parse external data before core sees it.     | Imports in `src/lib/adapters/**`                          |
| T5  | Domain identifiers that must not mix (body, user, entry ids) are branded types minted only by parse functions.                           | Type review                                               |
| T6  | Illegal states are unrepresentable: discriminated unions and `as const` tables over loose strings and boolean flags.                    | Type review                                               |
| T7  | The grant policy is a pure function in `src/lib/core/acl` with exhaustive Vitest coverage; hooks and routes stay thin callers.          | `pnpm vitest run --coverage` (100% branch on acl from M2) |
| T8  | Extensionless imports through the `@core`, `@adapters` and `@plugins` aliases; no NodeNext `.js` suffixes.                                | `grep -rn "from \"[^\"]*\.js\"" src plugins`              |
