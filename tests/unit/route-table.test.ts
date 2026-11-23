import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTE_TABLE, ruleFor } from "@adapters/emdash/route-table";
import { describe, expect, it } from "vitest";

const EMDASH_SRC = join(process.cwd(), "node_modules/emdash/src");
const ROUTES_TS = join(EMDASH_SRC, "astro/integration/routes.ts");
const UNSAFE: ReadonlySet<string> = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const routesSource = readFileSync(ROUTES_TS, "utf8");

/** Every route EmDash injects, with the HTTP methods its route file exports. */
const emdashRoutes = new Map(
	[
		...routesSource.matchAll(
			/pattern:\s*"([^"]+)",\s*entrypoint:\s*resolveRoute\(\s*"([^"]+)"\s*,?\s*\)/g,
		),
	].map(([, pattern = "", entrypoint = ""]) => {
		const route = readFileSync(join(EMDASH_SRC, "astro/routes", entrypoint), "utf8");
		const exported = route.matchAll(
			/export\s+(?:const|async\s+function|function)\s+(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE|ALL)\b/g,
		);
		return [pattern, new Set([...exported].map(([, method = ""]) => method))];
	}),
);

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
				.filter((method) => !Object.hasOwn(ROUTE_TABLE[pattern] ?? {}, method))
				.map((method) => `${method} ${pattern}`),
		);
		expect(unclassified).toEqual([]);
	});

	it("lists only routes and methods EmDash has", () => {
		const stale = Object.entries(ROUTE_TABLE).flatMap(([pattern, rules]) =>
			Object.keys(rules)
				.filter((method) => !emdashRoutes.get(pattern)?.has(method))
				.map((method) => `${method} ${pattern}`),
		);
		expect(stale).toEqual([]);
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
		["POST", "/_emdash/api/media", { kind: "upload" }],
		["PUT", "/_emdash/api/media/[id]/replace", { kind: "media-item" }],
		["DELETE", "/_emdash/api/media/[id]", { kind: "media-item" }],
		["POST", "/_emdash/api/mcp", { kind: "admin-only", action: "use-mcp" }],
		["GET", "/_emdash/api/mcp", { kind: "admin-only", action: "use-mcp" }],
	])("guards %s %s, a write no content hook sees", (method, pattern, rule) => {
		expect(ruleFor(pattern, method)).toEqual(rule);
	});
});
