import type { RuleViolation } from "@core/acl/content-rules";
import { denialText, type DenyReason } from "@core/acl/policy";
import type { BodyId } from "@core/ids";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, tag, userId } from "../../fixtures";

const names = new Map<BodyId, string>([
	[LODGE, "Findlay Lodge No. 227"],
	[CHAPTER, "Findlay Chapter No. 58"],
]);

const reasons: readonly (DenyReason | RuleViolation)[] = [
	{ code: "no-grant", user: userId("u1"), body: CHAPTER },
	{ code: "no-body-grants", user: userId("u1") },
	{ code: "missing-body" },
	{ code: "unknown-tags", body: LODGE, tags: [tag("bake-sale")] },
	{ code: "title-not-for-body-type", title: "King", bodyType: "Blue Lodge" },
];

describe("denialText", () => {
	it("names the body a grant is missing for (FR-5.2)", () => {
		const text = denialText({ code: "no-grant", user: userId("u1"), body: CHAPTER }, names);
		expect(text).toContain("Findlay Chapter No. 58");
		expect(text).toContain("u1");
	});

	it("falls back to the body id when the name is unknown", () => {
		const text = denialText({ code: "no-grant", user: userId("u1"), body: CHAPTER }, new Map());
		expect(text).toContain(CHAPTER);
	});

	it("names the user with no grants", () => {
		expect(denialText({ code: "no-body-grants", user: userId("u9") }, names)).toContain("u9");
	});

	it("names the body and each unknown tag", () => {
		const text = denialText(
			{ code: "unknown-tags", body: LODGE, tags: [tag("bake-sale"), tag("raffle")] },
			names,
		);
		expect(text).toContain("Findlay Lodge No. 227");
		expect(text).toContain("bake-sale, raffle");
	});

	it("names the title and the body type", () => {
		const text = denialText(
			{ code: "title-not-for-body-type", title: "King", bodyType: "Blue Lodge" },
			names,
		);
		expect(text).toContain('"King"');
		expect(text).toContain("Blue Lodge");
	});

	it.each(reasons)("is 1 to 500 characters with no angle brackets: $code", (reason) => {
		const text = denialText(reason, names);
		expect(text.length).toBeGreaterThan(0);
		expect(text.length).toBeLessThanOrEqual(500);
		expect(text).not.toMatch(/[<>]/);
	});

	it("strips angle brackets from user-supplied names, tags and titles", () => {
		const hostile = new Map<BodyId, string>([[LODGE, "<b>Lodge</b>"]]);
		const text = denialText(
			{ code: "unknown-tags", body: LODGE, tags: [tag("<script>x</script>")] },
			hostile,
		);
		expect(text).not.toMatch(/[<>]/);
		expect(text).toContain("bLodge/b");
	});

	it("cuts a long reason to 500 characters ending in an ellipsis", () => {
		const tags = Array.from({ length: 80 }, (_, i) => tag(`unlisted-tag-${i}`));
		const text = denialText({ code: "unknown-tags", body: LODGE, tags }, names);
		expect(text).toHaveLength(500);
		expect(text.endsWith("…")).toBe(true);
	});
});
