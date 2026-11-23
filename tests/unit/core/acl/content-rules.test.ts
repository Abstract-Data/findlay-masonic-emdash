import { checkOfficerTitle, checkTags } from "@core/acl/content-rules";
import { describe, expect, it } from "vitest";
import { LODGE, tag } from "../../fixtures";

const vocabulary = new Set([tag("ritual"), tag("degree-work"), tag("fellowship")]);

describe("checkTags (FR-3.2)", () => {
	it("accepts an entry with no tags", () => {
		expect(checkTags([], vocabulary, LODGE)).toEqual({ ok: true, value: undefined });
	});

	it("accepts tags that are all in the body's vocabulary", () => {
		expect(checkTags([tag("ritual"), tag("fellowship")], vocabulary, LODGE).ok).toBe(true);
	});

	it("rejects an unknown tag and names it with the body", () => {
		expect(checkTags([tag("ritual"), tag("bake-sale")], vocabulary, LODGE)).toEqual({
			ok: false,
			error: { code: "unknown-tags", body: LODGE, tags: [tag("bake-sale")] },
		});
	});

	it("names each unknown tag once, in entry order", () => {
		const tags = [tag("raffle"), tag("ritual"), tag("bake-sale"), tag("raffle")];
		expect(checkTags(tags, vocabulary, LODGE)).toEqual({
			ok: false,
			error: { code: "unknown-tags", body: LODGE, tags: [tag("raffle"), tag("bake-sale")] },
		});
	});

	it("rejects every tag when the body has no vocabulary", () => {
		expect(checkTags([tag("ritual")], new Set(), LODGE).ok).toBe(false);
	});
});

describe("checkOfficerTitle (FR-2.1)", () => {
	it("accepts a title from the body type's list", () => {
		expect(checkOfficerTitle("Worshipful Master", "Blue Lodge")).toEqual({
			ok: true,
			value: undefined,
		});
		expect(checkOfficerTitle("Worthy Matron", "Order of the Eastern Star").ok).toBe(true);
	});

	it("accepts a title shared by several body types for each of them", () => {
		expect(checkOfficerTitle("Treasurer", "Blue Lodge").ok).toBe(true);
		expect(checkOfficerTitle("Treasurer", "Temple Board").ok).toBe(true);
	});

	it("rejects another body type's title", () => {
		expect(checkOfficerTitle("Worshipful Master", "Chapter")).toEqual({
			ok: false,
			error: { code: "title-not-for-body-type", title: "Worshipful Master", bodyType: "Chapter" },
		});
	});

	it("matches titles exactly, as the select stores them", () => {
		expect(checkOfficerTitle("worshipful master", "Blue Lodge").ok).toBe(false);
	});
});
