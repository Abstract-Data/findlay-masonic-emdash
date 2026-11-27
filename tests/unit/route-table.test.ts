import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
	PLUGIN_ROUTES,
	ROUTE_TABLE,
	SAVE_ROUTES,
	ruleFor,
	savesEntry,
} from "@adapters/emdash/route-table";
import { createPlugin as bodyAccess } from "@plugins/body-access";
import { createPlugin as newsletter } from "@plugins/newsletter";
import { describe, expect, it } from "vitest";

const EMDASH_SRC = join(process.cwd(), "node_modules/emdash/src");
const ROUTES_TS = join(EMDASH_SRC, "astro/integration/routes.ts");
const UNSAFE: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const routesSource = readFileSync(ROUTES_TS, "utf8");

/** Every route file EmDash injects, by its pattern. */
const routeFiles = new Map(
	[
		...routesSource.matchAll(
			/pattern:\s*"([^"]+)",\s*entrypoint:\s*resolveRoute\(\s*"([^"]+)"\s*,?\s*\)/g,
		),
	].map(([, pattern = "", entrypoint = ""]) => [
		pattern,
		readFileSync(join(EMDASH_SRC, "astro/routes", entrypoint), "utf8"),
	]),
);

const EXPORT =
	/export\s+(?:const|async\s+function|function)\s+(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE|ALL)\b/g;

/** Every route EmDash injects, with the HTTP methods its route file exports. */
const emdashRoutes = new Map(
	[...routeFiles].map(([pattern, route]) => [
		pattern,
		new Set([...route.matchAll(EXPORT)].map(([, method = ""]) => method)),
	]),
);

/** The source of one method's handler in a route file. */
function handlerSource(pattern: string, method: string): string {
	const route = routeFiles.get(pattern) ?? "";
	const start = [...route.matchAll(EXPORT)].find(([, exported]) => exported === method)?.index;
	if (start === undefined) return "";
	const next = route.slice(start + 1).search(EXPORT);
	return next === -1 ? route.slice(start) : route.slice(start, start + 1 + next);
}

/**
 * How each function EmDash's entry routes call finds the entry `[id]` names, read from EmDash
 * 1.6.0: `findByIdOrSlug` (live) or `findByIdOrSlugIncludingTrashed` (trash), or the id alone.
 */
const RESOLVERS: readonly (readonly [RegExp, string])[] = [
	[/\bhandleContentGetIncludingTrashed\(/, "trash"],
	[/\bhandleRecoveryRevisionCreate\(/, "trash"],
	[/\bscheduledPolicyRejectionKey\(/, "id"],
	[/\bhandleContentGet\(/, "live"],
	[/\bsaveContent\(/, "live"],
	[/\bresolveEntry\(/, "live"],
	[/\bhandleRoomJoin\(/, "live"],
	[/\bdispatchPluginEditorExtensionApiRequest\(/, "live"],
];

const SCHEMAS = join(EMDASH_SRC, "api/schemas");
const schemaFiles = readdirSync(SCHEMAS)
	.filter((file) => file.endsWith(".ts"))
	.map((file) => readFileSync(join(SCHEMAS, file), "utf8"))
	.join("\n");

/** The source of one request-body schema EmDash declares in api/schemas, up to the next statement. */
function schemaSource(name: string): string {
	const start = schemaFiles.search(new RegExp(`export const ${name}\\b`));
	if (start === -1) return "";
	const next = schemaFiles.slice(start).search(/\n(?=[^\s.)}\]])/);
	return next === -1 ? schemaFiles.slice(start) : schemaFiles.slice(start, start + next);
}

function emdashLookups(pattern: string, method: string): string[] {
	const source = handlerSource(pattern, method);
	return [...new Set(RESOLVERS.filter(([call]) => call.test(source)).map(([, lookup]) => lookup))];
}

describe("EmDash route table (ADR-002)", () => {
	it("reads every route pattern EmDash injects", () => {
		const literals = routesSource.match(/pattern:\s*"/g) ?? [];
		expect(emdashRoutes.size).toBeGreaterThan(200);
		expect(emdashRoutes.size).toBe(literals.length);
	});

	it("finds no route that answers every method", () => {
		const catchAll = [...emdashRoutes].filter(([, methods]) => methods.has("ALL"));
		expect(catchAll).toEqual([]);
	});

	it("classifies every unsafe method of every EmDash route", () => {
		const unclassified = [...emdashRoutes].flatMap(([pattern, methods]) =>
			[...methods]
				.filter((method) => UNSAFE.has(method))
				.filter((method) => !Object.hasOwn(ROUTE_TABLE.get(pattern) ?? {}, method))
				.map((method) => `${method} ${pattern}`),
		);
		expect(unclassified).toEqual([]);
	});

	it("lists only routes and methods EmDash has", () => {
		const stale = [...ROUTE_TABLE].flatMap(([pattern, rules]) =>
			Object.keys(rules)
				.filter((method) => !emdashRoutes.get(pattern)?.has(method))
				.map((method) => `${method} ${pattern}`),
		);
		expect(stale).toEqual([]);
	});

	it("gives every entry rule the lookup EmDash's handler finds the entry with", () => {
		const entryRules = [...ROUTE_TABLE].flatMap(([pattern, rules]) =>
			Object.entries(rules).flatMap(([method, rule]) =>
				rule?.kind === "entry" ? [{ pattern, method, rule }] : [],
			),
		);
		expect(entryRules.length).toBeGreaterThan(10);
		const wrong = entryRules.flatMap(({ pattern, method, rule }) => {
			const found = emdashLookups(pattern, method);
			const lookup: unknown = Reflect.get(rule, "lookup");
			return found.length === 1 && found[0] === lookup
				? []
				: [`${method} ${pattern}: table ${String(lookup)}, EmDash ${found.join("+") || "unknown"}`];
		});
		expect(wrong).toEqual([]);
	});

	it("reads the body of every entry route whose body can set a slug", () => {
		const slugBodies = [...emdashRoutes].flatMap(([pattern, methods]) =>
			pattern.startsWith("/_emdash/api/content/[collection]")
				? [...methods]
						.filter((method) => UNSAFE.has(method))
						.filter((method) => {
							const schema = /parseBody\(\s*request,\s*(\w+)/.exec(handlerSource(pattern, method));
							return schema?.[1] !== undefined && /\bslug:/.test(schemaSource(schema[1]));
						})
						.map((method) => `${method} ${pattern}`)
				: [],
		);
		expect(slugBodies.toSorted()).toEqual([...SAVE_ROUTES].toSorted());
		expect(savesEntry("/_emdash/api/content/[collection]/[id]", "put")).toBe(true);
		expect(savesEntry("/_emdash/api/content/[collection]/[id]", "DELETE")).toBe(false);
	});

	it("refuses an unsafe request to an EmDash route it does not list", () => {
		expect(ruleFor("/_emdash/api/some-future-route", "POST")).toEqual({
			kind: "admin-only",
			action: "unlisted",
		});
		expect(ruleFor("/_emdash/api/content/[collection]/trash", "delete")).toEqual({
			kind: "admin-only",
			action: "unlisted",
		});
	});

	it("never guards a read or a route outside EmDash", () => {
		expect(ruleFor("/_emdash/api/some-future-route", "GET")).toBeNull();
		expect(ruleFor("/_emdash/api/content/[collection]/[id]", "HEAD")).toBeNull();
		expect(ruleFor("/bodies/[slug]", "POST")).toBeNull();
	});

	it.each([
		["PUT", "/_emdash/api/content/[collection]/[id]", { kind: "entry", action: "update" }],
		["DELETE", "/_emdash/api/content/[collection]/[id]", { kind: "entry", action: "delete" }],
		[
			"POST",
			"/_emdash/api/content/[collection]/[id]/restore",
			{ kind: "entry", action: "restore" },
		],
		[
			"POST",
			"/_emdash/api/content/[collection]/[id]/duplicate",
			{ kind: "entry", action: "duplicate" },
		],
		[
			"POST",
			"/_emdash/api/content/[collection]/[id]/discard-draft",
			{ kind: "entry", action: "discard" },
		],
		[
			"DELETE",
			"/_emdash/api/content/[collection]/[id]/schedule",
			{ kind: "entry", action: "unschedule" },
		],
		["POST", "/_emdash/api/revisions/[revisionId]/restore", { kind: "revision-restore" }],
		["POST", "/_emdash/api/content/[collection]/[id]/lock", { kind: "entry", action: "update" }],
		["POST", "/_emdash/api/content/[collection]/[id]/room", { kind: "entry", action: "update" }],
		[
			"POST",
			"/_emdash/api/content/[collection]/[id]/unpublish",
			{ kind: "entry", action: "unpublish" },
		],
		["POST", "/_emdash/api/media", { kind: "upload" }],
		["PUT", "/_emdash/api/media/[id]/replace", { kind: "media-item" }],
		["DELETE", "/_emdash/api/media/[id]", { kind: "media-item" }],
		["POST", "/_emdash/api/mcp", { kind: "admin-only", action: "use-mcp" }],
		["GET", "/_emdash/api/mcp", { kind: "admin-only", action: "use-mcp" }],
	])("guards %s %s in the middleware", (method, pattern, rule) => {
		expect(ruleFor(pattern, method)).toMatchObject(rule);
	});

	it("reads no rule from Object.prototype", () => {
		expect(ruleFor("constructor", "POST")).toBeNull();
		expect(ruleFor("/_emdash/api/media", "constructor")).toEqual({
			kind: "admin-only",
			action: "unlisted",
		});
	});
});

/** Every native plugin this site registers, by the id its descriptor in astro.config.mjs gives. */
const NATIVE_PLUGINS = { "body-access": bodyAccess, newsletter } as const;

describe("native plugin routes (ADR-002, ADR-003)", () => {
	it("knows every native plugin astro.config.mjs registers", () => {
		const config = readFileSync("astro.config.mjs", "utf8");
		const ids = [
			...config.matchAll(/id:\s*"([^"]+)",\s*version:\s*"[^"]+",\s*format:\s*"native"/g),
		].map(([, id = ""]) => id);
		expect(ids.toSorted()).toEqual(Object.keys(NATIVE_PLUGINS).toSorted());
	});

	it("passes plugin routes to EmDash, which checks each route's own permission", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
			expect(ruleFor("/_emdash/api/plugins/[pluginId]/[...path]", method)).toEqual({
				kind: "pass",
				why: "plugin",
			});
		}
	});

	it("classifies every route each native plugin declares, and only those", () => {
		const declared = Object.entries(NATIVE_PLUGINS).flatMap(([id, create]) =>
			Object.keys(create().routes).map((route) => `${id}/${route}`),
		);
		expect(declared.toSorted()).toEqual([...PLUGIN_ROUTES.keys()].toSorted());
	});

	it("gives each plugin route the guard the table records", () => {
		const mismatched = Object.entries(NATIVE_PLUGINS).flatMap(([id, create]) =>
			Object.entries(create().routes).flatMap(([route, declared]) => {
				const guard = PLUGIN_ROUTES.get(`${id}/${route}`);
				const matches =
					guard?.kind === "public"
						? declared.public === true
						: declared.public !== true && declared.permission === guard?.permission;
				return matches ? [] : [`${id}/${route}`];
			}),
		);
		expect(mismatched).toEqual([]);
	});
});
