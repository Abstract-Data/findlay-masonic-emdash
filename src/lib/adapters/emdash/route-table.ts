import type { EntryAction } from "./entries";

/**
 * Why the middleware lets a write through: `hook` writes are guarded by the body-access content
 * hooks; `site` writes are site-wide (accepted residual risk); `account` is sign-in and the
 * caller's own account; `plugin` routes declare their own permission; `read` writes nothing;
 * `dev` exists only in development.
 */
export type PassReason = "hook" | "site" | "account" | "plugin" | "read" | "dev";

/**
 * How the EmDash handler behind a route finds the entry its `[id]` names. `live` reads the id
 * or the slug outside the trash (findByIdOrSlug); `trash` reads them trash included
 * (findByIdOrSlugIncludingTrashed); `id` reads the id alone, trash included.
 * tests/unit/route-table.test.ts reads each route's handler to check it.
 */
export type Lookup = "live" | "trash" | "id";

export type RouteRule =
	| { readonly kind: "entry"; readonly action: EntryAction; readonly lookup: Lookup }
	| { readonly kind: "revision-restore" }
	| { readonly kind: "upload" }
	| { readonly kind: "media-item" }
	| { readonly kind: "admin-only"; readonly action: "use-mcp" | "unlisted" }
	| { readonly kind: "pass"; readonly why: PassReason };

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type Rules = Readonly<Partial<Record<Method, RouteRule>>>;

const entry = (action: EntryAction, lookup: Lookup): RouteRule => ({
	kind: "entry",
	action,
	lookup,
});
const pass = (why: PassReason): RouteRule => ({ kind: "pass", why });
const ADMIN: RouteRule = { kind: "admin-only", action: "unlisted" };
const MCP: RouteRule = { kind: "admin-only", action: "use-mcp" };
const UPLOAD: RouteRule = { kind: "upload" };
const MEDIA: RouteRule = { kind: "media-item" };
const SITE = pass("site");
const ACCOUNT = pass("account");

const all = (rule: RouteRule, ...methods: Method[]): Rules =>
	Object.fromEntries(methods.map((method) => [method, rule]));

/**
 * Every unsafe EmDash API route, keyed by the pattern EmDash injects (Astro's routePattern),
 * as classified for a signed-in user below Admin. tests/unit/route-table.test.ts fails when
 * EmDash adds an unsafe route this table does not classify. Admins skip the table entirely.
 */
const TABLE: Readonly<Record<string, Rules>> = {
	"/_emdash/api/visual-editing/action-token": { POST: pass("read") },
	"/_emdash/api/visual-editing/content/[collection]/[id]/publish": { POST: pass("hook") },
	"/_emdash/api/admin/scheduled-policy-rejections/[collection]/[id]": {
		DELETE: entry("update", "id"),
	},

	"/_emdash/api/content/[collection]": { POST: pass("hook") },
	"/_emdash/api/content/[collection]/[id]": {
		PUT: entry("update", "live"),
		DELETE: entry("delete", "live"),
	},
	"/_emdash/api/content/[collection]/[id]/plugin-extensions/[pluginId]/[kind]/[extensionId]": {
		POST: entry("update", "live"),
	},
	"/_emdash/api/content/[collection]/[id]/revisions": { POST: entry("update", "trash") },
	"/_emdash/api/content/[collection]/[id]/preview-url": { POST: pass("read") },
	"/_emdash/api/content/[collection]/[id]/restore": { POST: entry("restore", "trash") },
	"/_emdash/api/content/[collection]/[id]/permanent": { DELETE: ADMIN },
	"/_emdash/api/content/[collection]/[id]/duplicate": { POST: entry("duplicate", "live") },
	"/_emdash/api/content/[collection]/[id]/publish": { POST: pass("hook") },
	// EmDash hands beforeUnpublish the live entry only, so the draft's body is checked here first.
	"/_emdash/api/content/[collection]/[id]/unpublish": { POST: entry("unpublish", "live") },
	"/_emdash/api/content/[collection]/[id]/discard-draft": { POST: entry("discard", "live") },
	"/_emdash/api/content/[collection]/[id]/lock": all(entry("update", "live"), "POST", "DELETE"),
	"/_emdash/api/content/[collection]/[id]/room": { POST: entry("update", "live") },
	"/_emdash/api/content/[collection]/[id]/schedule": {
		POST: pass("hook"),
		DELETE: entry("unschedule", "live"),
	},
	"/_emdash/api/content/[collection]/[id]/terms/[taxonomy]": { POST: entry("update", "live") },
	"/_emdash/api/revisions/[revisionId]/restore": { POST: { kind: "revision-restore" } },

	"/_emdash/api/media": { POST: UPLOAD },
	"/_emdash/api/media/upload-url": { POST: UPLOAD },
	"/_emdash/api/media/providers/[providerId]": { POST: UPLOAD },
	"/_emdash/api/media/[id]": all(MEDIA, "PUT", "DELETE"),
	"/_emdash/api/media/[id]/confirm": { POST: MEDIA },
	"/_emdash/api/media/[id]/upload": { PUT: MEDIA },
	"/_emdash/api/media/[id]/replace": { PUT: MEDIA },
	"/_emdash/api/media/providers/[providerId]/[itemId]": { DELETE: MEDIA },
	"/_emdash/api/media/folders": { POST: SITE },
	"/_emdash/api/media/folders/[id]": all(SITE, "PUT", "DELETE"),

	"/_emdash/api/menus": { POST: SITE },
	"/_emdash/api/menus/[name]": all(SITE, "PUT", "DELETE"),
	"/_emdash/api/menus/[name]/items": { POST: SITE },
	"/_emdash/api/menus/[name]/items/[id]": all(SITE, "PUT", "DELETE"),
	"/_emdash/api/menus/[name]/reorder": { POST: SITE },
	"/_emdash/api/menus/[name]/translations": { POST: SITE },
	"/_emdash/api/widget-areas": { POST: SITE },
	"/_emdash/api/widget-areas/[name]": { DELETE: SITE },
	"/_emdash/api/widget-areas/[name]/widgets": { POST: SITE },
	"/_emdash/api/widget-areas/[name]/widgets/[id]": all(SITE, "PUT", "DELETE"),
	"/_emdash/api/widget-areas/[name]/reorder": { POST: SITE },
	"/_emdash/api/sections": { POST: SITE },
	"/_emdash/api/sections/[slug]": all(SITE, "PUT", "DELETE"),
	"/_emdash/api/admin/bylines": { POST: SITE },
	"/_emdash/api/admin/bylines/[id]": all(SITE, "PUT", "DELETE"),
	"/_emdash/api/admin/bylines/[id]/translations": { POST: SITE },
	"/_emdash/api/comments/[collection]/[contentId]": { POST: SITE },
	"/_emdash/api/comments/[collection]/[contentId]/reactions": { POST: SITE },
	"/_emdash/api/admin/comments/bulk": { POST: SITE },
	"/_emdash/api/admin/comments/[id]/status": { PUT: SITE },
	"/_emdash/api/admin/comments/[id]": { DELETE: SITE },

	"/_emdash/api/plugins/[pluginId]/[...path]": all(
		pass("plugin"),
		"POST",
		"PUT",
		"PATCH",
		"DELETE",
	),
	"/_emdash/api/mcp": all(MCP, "GET", "POST", "DELETE"),
	"/_emdash/api/themes/preview": { POST: pass("read") },
	"/_emdash/api/site/domain-proof": { POST: pass("read") },

	"/_emdash/api/auth/me": { POST: ACCOUNT },
	"/_emdash/api/auth/logout": { POST: ACCOUNT },
	"/_emdash/api/auth/passkey/options": { POST: ACCOUNT },
	"/_emdash/api/auth/passkey/verify": { POST: ACCOUNT },
	"/_emdash/api/auth/passkey/register/options": { POST: ACCOUNT },
	"/_emdash/api/auth/passkey/register/verify": { POST: ACCOUNT },
	"/_emdash/api/auth/passkey/[id]": all(ACCOUNT, "PATCH", "DELETE"),
	"/_emdash/api/auth/invite/complete": { POST: ACCOUNT },
	"/_emdash/api/auth/invite/register-options": { POST: ACCOUNT },
	"/_emdash/api/auth/magic-link/send": { POST: ACCOUNT },
	"/_emdash/api/auth/magic-link/verify": { POST: ACCOUNT },
	"/_emdash/api/auth/handover": { POST: ACCOUNT },
	"/_emdash/api/auth/signup/request": { POST: ACCOUNT },
	"/_emdash/api/auth/signup/register-options": { POST: ACCOUNT },
	"/_emdash/api/auth/signup/complete": { POST: ACCOUNT },
	"/_emdash/api/oauth/device/code": { POST: ACCOUNT },
	"/_emdash/api/oauth/device/token": { POST: ACCOUNT },
	"/_emdash/api/oauth/device/authorize": { POST: ACCOUNT },
	"/_emdash/api/oauth/token/refresh": { POST: ACCOUNT },
	"/_emdash/api/oauth/token/revoke": { POST: ACCOUNT },
	"/_emdash/api/oauth/token": { POST: ACCOUNT },
	"/_emdash/oauth/authorize": { POST: ACCOUNT },
	"/_emdash/api/oauth/register": { POST: ACCOUNT },
	"/_emdash/api/setup": { POST: ACCOUNT },
	"/_emdash/api/setup/admin": { POST: ACCOUNT },
	"/_emdash/api/setup/admin/verify": { POST: ACCOUNT },

	"/_emdash/api/setup/dev-bypass": { POST: pass("dev") },
	"/_emdash/api/auth/dev-bypass": { POST: pass("dev") },
	"/_emdash/api/setup/dev-reset": { POST: pass("dev") },
	"/_emdash/api/dev/emails": { DELETE: pass("dev") },
	"/_emdash/api/dev/scheduled-tasks": { POST: pass("dev") },

	"/_emdash/api/auth/invite": { POST: ADMIN },
	"/_emdash/api/typegen": { POST: ADMIN },
	"/_emdash/api/admin/media-usage/repair": { POST: ADMIN },
	"/_emdash/api/admin/media-usage/work/retry": { POST: ADMIN },
	"/_emdash/api/admin/media-usage/activation": { POST: ADMIN },
	"/_emdash/api/admin/media-usage/progress": { POST: ADMIN },
	"/_emdash/api/admin/media-usage/collection-deletions/retry": { POST: ADMIN },
	"/_emdash/api/import/probe": { POST: ADMIN },
	"/_emdash/api/import/wordpress/analyze": { POST: ADMIN },
	"/_emdash/api/import/wordpress/prepare": { POST: ADMIN },
	"/_emdash/api/import/wordpress/execute": { POST: ADMIN },
	"/_emdash/api/import/wordpress/media": { POST: ADMIN },
	"/_emdash/api/import/wordpress/rewrite-urls": { POST: ADMIN },
	"/_emdash/api/import/wordpress-plugin/analyze": { POST: ADMIN },
	"/_emdash/api/import/wordpress-plugin/execute": { POST: ADMIN },
	"/_emdash/api/schema/collections": { POST: ADMIN },
	"/_emdash/api/schema/block-types": { POST: ADMIN },
	"/_emdash/api/schema/block-types/[slug]/versions/[version]/activate": { POST: ADMIN },
	"/_emdash/api/schema/block-types/[slug]": { PUT: ADMIN },
	"/_emdash/api/schema/collections/reorder": { POST: ADMIN },
	"/_emdash/api/schema/collections/[slug]": all(ADMIN, "PUT", "DELETE"),
	"/_emdash/api/schema/collections/[slug]/fields": { POST: ADMIN },
	"/_emdash/api/schema/collections/[slug]/fields/reorder": { POST: ADMIN },
	"/_emdash/api/schema/collections/[slug]/fields/[fieldSlug]": all(ADMIN, "PUT", "DELETE"),
	"/_emdash/api/schema/orphans/[slug]": { POST: ADMIN },
	"/_emdash/api/settings": { POST: ADMIN },
	"/_emdash/api/settings/email": all(ADMIN, "POST", "PUT"),
	"/_emdash/api/settings/domain": { POST: ADMIN },
	"/_emdash/api/settings/domain/notify": { POST: ADMIN },
	"/_emdash/api/settings/backups": { PUT: ADMIN },
	"/_emdash/api/settings/backups/archives": { POST: ADMIN },
	"/_emdash/api/settings/backups/archives/[name]": { DELETE: ADMIN },
	"/_emdash/api/admin/transfer/[...path]": all(ADMIN, "POST", "PUT", "DELETE"),
	// Body tags are a field on each body, never a taxonomy (constitution), so editors need none.
	"/_emdash/api/taxonomies": { POST: ADMIN },
	"/_emdash/api/taxonomies/bulk-tag": { POST: ADMIN },
	"/_emdash/api/taxonomies/[name]": all(ADMIN, "PUT", "DELETE"),
	"/_emdash/api/taxonomies/[name]/reorder": { POST: ADMIN },
	"/_emdash/api/taxonomies/[name]/terms": { POST: ADMIN },
	"/_emdash/api/taxonomies/[name]/terms/[slug]": all(ADMIN, "PUT", "DELETE"),
	"/_emdash/api/taxonomies/[name]/terms/[slug]/translations": { POST: ADMIN },
	"/_emdash/api/relations": { POST: ADMIN },
	"/_emdash/api/relations/[id]": all(ADMIN, "PATCH", "DELETE"),
	"/_emdash/api/admin/plugins/[id]/enable": { POST: ADMIN },
	"/_emdash/api/admin/plugins/[id]/disable": { POST: ADMIN },
	"/_emdash/api/admin/plugins/[id]/mcp": { PUT: ADMIN },
	"/_emdash/api/admin/plugins/[id]/settings": { PUT: ADMIN },
	"/_emdash/api/admin/plugins/marketplace/[id]/install": { POST: ADMIN },
	"/_emdash/api/admin/plugins/registry/install": { POST: ADMIN },
	"/_emdash/api/admin/plugins/registry/verify": { POST: ADMIN },
	"/_emdash/api/admin/plugins/registry/[id]/update": { POST: ADMIN },
	"/_emdash/api/admin/plugins/registry/[id]/uninstall": { POST: ADMIN },
	"/_emdash/api/admin/plugins/[id]/update": { POST: ADMIN },
	"/_emdash/api/admin/plugins/[id]/uninstall": { POST: ADMIN },
	"/_emdash/api/admin/hooks/exclusive/[hookName]": { PUT: ADMIN },
	"/_emdash/api/admin/byline-fields": { POST: ADMIN },
	"/_emdash/api/admin/byline-fields/reorder": { POST: ADMIN },
	"/_emdash/api/admin/byline-fields/[slug]": all(ADMIN, "PATCH", "DELETE"),
	"/_emdash/api/admin/users/[id]": { PUT: ADMIN },
	"/_emdash/api/admin/users/[id]/disable": { POST: ADMIN },
	"/_emdash/api/admin/users/[id]/enable": { POST: ADMIN },
	"/_emdash/api/admin/users/[id]/send-recovery": { POST: ADMIN },
	"/_emdash/api/admin/api-tokens": { POST: ADMIN },
	"/_emdash/api/admin/api-tokens/[id]": { DELETE: ADMIN },
	"/_emdash/api/admin/oauth-clients": { POST: ADMIN },
	"/_emdash/api/admin/oauth-clients/[id]": all(ADMIN, "PUT", "DELETE"),
	"/_emdash/api/admin/allowed-domains": { POST: ADMIN },
	"/_emdash/api/admin/allowed-domains/[domain]": all(ADMIN, "PATCH", "DELETE"),
	"/_emdash/api/redirects": { POST: ADMIN },
	"/_emdash/api/redirects/404s": all(ADMIN, "POST", "DELETE"),
	"/_emdash/api/redirects/[id]": all(ADMIN, "PUT", "DELETE"),
	"/_emdash/api/search/rebuild": { POST: ADMIN },
	"/_emdash/api/search/enable": { POST: ADMIN },
};

export const ROUTE_TABLE: ReadonlyMap<string, Rules> = new Map(Object.entries(TABLE));

/**
 * What guards a native plugin route the table passes as `plugin`: EmDash checks a route's
 * permission before its handler runs (Admin alone holds `users:manage` and `settings:manage`),
 * and a public route makes its own checks. tests/unit/route-table.test.ts fails when a plugin
 * declares a route this map does not classify, or classifies it differently.
 */
export type PluginRouteGuard =
	| {
			readonly kind: "permission";
			readonly permission: "users:manage" | "settings:manage" | "content:create";
	  }
	| { readonly kind: "public"; readonly checks: string };

const ADMIN_SETTINGS: PluginRouteGuard = { kind: "permission", permission: "settings:manage" };

/** Keyed `<pluginId>/<route>`, as EmDash mounts them under `/_emdash/api/plugins/`. */
export const PLUGIN_ROUTES: ReadonlyMap<string, PluginRouteGuard> = new Map<
	string,
	PluginRouteGuard
>([
	["body-access/grants/list", { kind: "permission", permission: "users:manage" }],
	["body-access/grants/set", { kind: "permission", permission: "users:manage" }],
	["body-access/my-bodies", { kind: "permission", permission: "content:create" }],
	["newsletter/issues/list", ADMIN_SETTINGS],
	["newsletter/issues/get", ADMIN_SETTINGS],
	["newsletter/issues/new", ADMIN_SETTINGS],
	["newsletter/issues/save", ADMIN_SETTINGS],
	["newsletter/issues/test-send", ADMIN_SETTINGS],
	["newsletter/issues/approve", ADMIN_SETTINGS],
	["newsletter/issues/discard", ADMIN_SETTINGS],
	// Registered only by the dev server (src/plugins/newsletter/routes.ts).
	["newsletter/dev/outbox", ADMIN_SETTINGS],
	[
		"newsletter/subscribe",
		{ kind: "public", checks: "site Origin or X-EmDash-Request, zod, Turnstile (FR-7.1, 7.2)" },
	],
]);

/**
 * The routes whose JSON body sets an entry's slug, and on an update its status: the middleware
 * reads those two fields. tests/unit/route-table.test.ts derives this list from EmDash.
 */
export const SAVE_ROUTES: ReadonlySet<string> = new Set([
	"POST /_emdash/api/content/[collection]",
	"PUT /_emdash/api/content/[collection]/[id]",
	"POST /_emdash/api/content/[collection]/[id]/revisions",
]);

/** Whether a request's body is an entry save the middleware reads. */
export function savesEntry(routePattern: string, method: string): boolean {
	return SAVE_ROUTES.has(`${method.toUpperCase()} ${routePattern}`);
}

const METHODS: ReadonlySet<string> = new Set<Method>(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const isMethod = (method: string): method is Method => METHODS.has(method);

/**
 * The rule for a request, by the route Astro matched. An unsafe method on an EmDash route the
 * table does not list is Admin-only (fail closed); a safe method is never guarded.
 */
export function ruleFor(routePattern: string, method: string): RouteRule | null {
	const upper = method.toUpperCase();
	const rules = ROUTE_TABLE.get(routePattern);
	const listed =
		rules !== undefined && isMethod(upper) && Object.hasOwn(rules, upper)
			? rules[upper]
			: undefined;
	if (listed !== undefined) return listed;
	const safe = upper === "GET" || upper === "HEAD" || upper === "OPTIONS";
	return safe || !routePattern.startsWith("/_emdash/") ? null : ADMIN;
}
