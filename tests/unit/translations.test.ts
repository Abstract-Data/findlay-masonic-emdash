import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("translation groups (ADR-002 residual risk 7)", () => {
	it("keeps Astro i18n off, so EmDash never copies fields across a translation group", () => {
		const config = readFileSync("astro.config.mjs", "utf8");
		expect(
			config,
			"Two or more locales turn on EmDash's group-wide writes; extend the body guard to them first",
		).not.toMatch(/\bi18n\s*:/);
	});
});
