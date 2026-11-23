import { checkOfficerTitle, checkTags, checkTranslationBody } from "@core/acl/content-rules";
import { TITLES_BY_BODY_TYPE } from "@core/acl/officer-titles";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, tag } from "../../fixtures";

const vocabulary = new Set([tag("ritual"), tag("degree-work"), tag("fellowship")]);

describe("checkTranslationBody (ADR-002)", () => {
	it("accepts a translation in its source's body", () => {
		expect(checkTranslationBody(CHAPTER, CHAPTER)).toEqual({ ok: true, value: undefined });
	});

	it("rejects a translation in another body, naming the source's body", () => {
		expect(checkTranslationBody(LODGE, CHAPTER)).toEqual({
			ok: false,
			error: { code: "translation-in-another-body", body: CHAPTER },
		});
	});
});

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

// The draft lists in docs/plans/0001-findlay-masonic-platform/officer-titles.md, in display
// order. seed.test.ts pins only their union, which hides a title moved between body types.
const DRAFT_TITLES = {
	"Blue Lodge": [
		"Worshipful Master",
		"Senior Warden",
		"Junior Warden",
		"Treasurer",
		"Secretary",
		"Senior Deacon",
		"Junior Deacon",
		"Senior Steward",
		"Junior Steward",
		"Chaplain",
		"Tyler",
	],
	Chapter: [
		"High Priest",
		"King",
		"Scribe",
		"Treasurer",
		"Secretary",
		"Chaplain",
		"Captain of the Host",
		"Principal Sojourner",
		"Royal Arch Captain",
		"Master of the Third Veil",
		"Master of the Second Veil",
		"Master of the First Veil",
		"Sentinel",
	],
	Council: [
		"Illustrious Master",
		"Deputy Master",
		"Principal Conductor of the Work",
		"Treasurer",
		"Recorder",
		"Chaplain",
		"Captain of the Guard",
		"Conductor of the Council",
		"Steward",
		"Sentinel",
	],
	Commandery: [
		"Eminent Commander",
		"Generalissimo",
		"Captain General",
		"Prelate",
		"Senior Warden",
		"Junior Warden",
		"Treasurer",
		"Recorder",
		"Standard Bearer",
		"Sword Bearer",
		"Warder",
		"Sentinel",
	],
	"Order of the Eastern Star": [
		"Worthy Matron",
		"Worthy Patron",
		"Associate Matron",
		"Associate Patron",
		"Secretary",
		"Treasurer",
		"Conductress",
		"Associate Conductress",
		"Chaplain",
		"Marshal",
		"Organist",
		"Adah",
		"Ruth",
		"Esther",
		"Martha",
		"Electa",
		"Warder",
		"Sentinel",
	],
	"Temple Board": ["President", "Vice President", "Secretary", "Treasurer", "Trustee"],
};

describe("TITLES_BY_BODY_TYPE (FR-2.1)", () => {
	it("holds each body type's draft list exactly, in display order", () => {
		expect(TITLES_BY_BODY_TYPE).toEqual(DRAFT_TITLES);
	});
});
