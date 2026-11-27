import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Drops // and /* */ comments outside strings, then trailing commas.
function parseJsonc(text: string): unknown {
	let out = "";
	let inString = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			out += ch;
			if (ch === "\\") out += text[++i] ?? "";
			else if (ch === '"') inString = false;
		} else if (ch === '"') {
			inString = true;
			out += ch;
		} else if (ch === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			out += "\n";
		} else if (ch === "/" && text[i + 1] === "*") {
			i = text.indexOf("*/", i + 2) + 1;
		} else {
			out += ch;
		}
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function at(value: unknown, ...path: (string | number)[]): string | undefined {
	let current: unknown = value;
	for (const key of path) {
		if (typeof current !== "object" || current === null) return undefined;
		current = Reflect.get(current, key);
	}
	return typeof current === "string" ? current : undefined;
}

const config = parseJsonc(readFileSync("wrangler.jsonc", "utf8"));

function resources(env: "staging" | "production"): Record<string, string | undefined> {
	return {
		"D1 database_id": at(config, "env", env, "d1_databases", 0, "database_id"),
		"D1 database_name": at(config, "env", env, "d1_databases", 0, "database_name"),
		"R2 bucket_name": at(config, "env", env, "r2_buckets", 0, "bucket_name"),
		"KV id": at(config, "env", env, "kv_namespaces", 0, "id"),
	};
}

const isSet = (value: string | undefined): value is string =>
	value !== undefined && !value.startsWith("<");

describe("wrangler.jsonc environments (constitution amendment 1)", () => {
	const stagingResources = resources("staging");
	const productionResources = resources("production");

	it("reads both environments' resources", () => {
		expect(stagingResources["R2 bucket_name"]).toBe("findlay-masonic-media-staging");
		expect(productionResources["D1 database_name"]).toBe("findlay-masonic-production");
	});

	it.each(Object.keys(stagingResources))("staging and production never share a %s", (kind) => {
		const a = stagingResources[kind];
		const b = productionResources[kind];
		if (!isSet(a) || !isSet(b)) return;
		expect(a).not.toBe(b);
	});

	// Wrangler does not inherit top-level vars into an environment, and astro:env reads these
	// from the Worker's env at runtime (tests/build/check-runtime-env.mjs).
	it.each(["staging", "production"])(
		"%s declares the newsletter and form settings as vars, and no secret",
		(env) => {
			const environment: unknown = Reflect.get(Object(Reflect.get(Object(config), "env")), env);
			expect(Object.keys(Object(Reflect.get(Object(environment), "vars"))).toSorted()).toEqual([
				"NEWSLETTER_TEST_ALLOWLIST",
				"RESEND_FROM",
				"RESEND_NEWSLETTER_TOPIC_ID",
				"RESEND_SEGMENT_ID",
				"SITE_ENV",
				"TURNSTILE_SITE_KEY",
			]);
		},
	);

	// Invocation logs and traces carry each request's URL, and EmDash puts preview, magic-link,
	// invite and sign-up tokens in the query string; Workers Logs stores both (M7 review S4).
	it.each(["staging", "production"])(
		"%s keeps query strings out of the logs and traces it stores",
		(env) => {
			const environment: unknown = Reflect.get(Object(Reflect.get(Object(config), "env")), env);
			const observability: unknown = Reflect.get(Object(environment), "observability");
			expect(Reflect.get(Object(observability), "redact_query_string")).toBe(true);
		},
	);

	// Only production may email anyone; the top level (local dev) sets nothing, so it fails closed.
	it("names each environment in SITE_ENV, and local dev not at all", () => {
		const vars = (env: string): unknown =>
			Reflect.get(Object(Reflect.get(Object(Reflect.get(Object(config), "env")), env)), "vars");
		expect(Reflect.get(Object(vars("staging")), "SITE_ENV")).toBe("staging");
		expect(Reflect.get(Object(vars("production")), "SITE_ENV")).toBe("production");
		expect(Reflect.get(Object(config), "vars")).toBeUndefined();
	});
});
