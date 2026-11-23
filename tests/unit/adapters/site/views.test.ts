import { parseRecipients } from "@adapters/emdash/parse";
import {
	chosenBodies,
	chosenTag,
	newestFirst,
	parseBodyView,
	parseNewsView,
	parseOfficerView,
	type BodyView,
} from "@adapters/site/views";
import type { EmDashCollections } from "emdash";
import { describe, expect, it } from "vitest";
import { bodyId, entryId, instant, LODGE } from "../../fixtures";

type BodyData = EmDashCollections["bodies"];

const SYSTEM = {
	status: "published",
	createdAt: new Date(),
	updatedAt: new Date(),
	publishedAt: null,
};

function bodyEntry(extra: Partial<BodyData> = {}) {
	return {
		id: "blue-lodge",
		data: {
			...SYSTEM,
			id: LODGE,
			slug: "blue-lodge",
			name: "Findlay Lodge",
			number: 227,
			body_type: "Blue Lodge",
			...extra,
		} satisfies BodyData,
	};
}

describe("parseBodyView", () => {
	it("names the body in full and by its calendar label", () => {
		expect(parseBodyView(bodyEntry())).toMatchObject({
			id: LODGE,
			slug: "blue-lodge",
			displayName: "Findlay Lodge No. 227",
			label: "Lodge 227",
			bodyType: "Blue Lodge",
			scheduleNote: null,
			description: [],
		});
	});

	it("says whether the contact form reaches anyone, without carrying the addresses (spec Q12)", () => {
		const none = parseBodyView(bodyEntry({ contact_recipients: [{ email: "  " }] }));
		const some = parseBodyView(
			bodyEntry({ contact_recipients: [{ email: "secretary@example.test" }] }),
		);
		expect(none?.acceptsMessages).toBe(false);
		expect(some?.acceptsMessages).toBe(true);
		expect(JSON.stringify(some)).not.toContain("secretary@example.test");
	});

	it("keeps the tag vocabulary's labels, merging repeats and blank rows", () => {
		const view = parseBodyView(
			bodyEntry({
				tag_vocabulary: [
					{ slug: "Ritual Work", label: "Ritual work" },
					{ slug: "ritual-work", label: "Again" },
					{ slug: "social", label: " " },
					{ slug: " ", label: "Blank" },
				],
			}),
		);
		expect(view?.tags).toEqual([
			{ slug: "ritual-work", label: "Ritual work" },
			{ slug: "social", label: "social" },
		]);
	});

	it("keeps a trimmed schedule note and drops a blank one", () => {
		expect(parseBodyView(bodyEntry({ schedule_note: "  Dark in summer " }))?.scheduleNote).toBe(
			"Dark in summer",
		);
		expect(parseBodyView(bodyEntry({ schedule_note: " " }))?.scheduleNote).toBeNull();
	});

	it("refuses an entry without a valid id", () => {
		expect(parseBodyView({ ...bodyEntry(), data: { ...bodyEntry().data, id: "nope" } })).toBeNull();
	});
});

describe("parseRecipients (spec Q12)", () => {
	it("keeps trimmed addresses and drops blank or malformed rows", () => {
		expect(parseRecipients([{ email: " a@example.test " }, { email: "" }, {}])).toEqual([
			"a@example.test",
		]);
		expect(parseRecipients([{ email: 3 }])).toEqual([]);
		expect(parseRecipients(null)).toEqual([]);
		expect(parseRecipients("a@example.test")).toEqual([]);
	});
});

const officer = (extra: Partial<EmDashCollections["officers"]> = {}) => ({
	id: "wm",
	data: {
		...SYSTEM,
		id: entryId(5),
		slug: null,
		body: LODGE,
		title: "Worshipful Master" as const,
		name: " Drew DeVore ",
		term_year: 2026,
		...extra,
	},
});

const news = (extra: Partial<EmDashCollections["news"]> = {}) => ({
	id: "degree-night",
	data: {
		...SYSTEM,
		id: entryId(7),
		slug: "degree-night",
		body: LODGE,
		title: "Degree night",
		content: [],
		publish_date: "2026-11-20T15:00:00.000Z",
		tags: [{ tag: "Ritual Work" }],
		...extra,
	},
});

function fixtureBody(slug: string, n: number): BodyView {
	const parsed = parseBodyView({
		id: slug,
		data: {
			...bodyEntry().data,
			id: bodyId(n),
			slug,
			tag_vocabulary: [{ slug: "social", label: "Social" }],
		},
	});
	if (parsed === null) throw new Error("fixture body did not parse");
	return parsed;
}

describe("parseOfficerView (FR-2.2)", () => {
	it("reads the title, name, term and display order", () => {
		expect(parseOfficerView(officer({ display_order: 1 }))).toMatchObject({
			name: "Drew DeVore",
			title: "Worshipful Master",
			termYear: 2026,
			order: 1,
			photo: null,
		});
		expect(parseOfficerView(officer())?.order).toBeNull();
	});

	it("refuses an officer without a name", () => {
		expect(parseOfficerView(officer({ name: " " }))).toBeNull();
	});
});

describe("parseNewsView (FR-3.3, 3.4)", () => {
	it("reads the body, publish date and tags", () => {
		expect(parseNewsView(news())).toMatchObject({
			slug: "degree-night",
			body: LODGE,
			publishedAt: instant("2026-11-20T15:00:00Z"),
			tags: ["ritual-work"],
		});
	});

	it("falls back to the time EmDash published it", () => {
		const view = parseNewsView(
			news({ publish_date: "not a date", publishedAt: new Date("2026-11-21T00:00:00Z") }),
		);
		expect(view?.publishedAt).toEqual(instant("2026-11-21T00:00:00Z"));
	});

	it("refuses an item with no body or no date", () => {
		expect(parseNewsView(news({ body: "" }))).toBeNull();
		expect(parseNewsView(news({ publish_date: "" }))).toBeNull();
	});

	it("sorts newest first", () => {
		const older = parseNewsView(news({ publish_date: "2026-10-01T00:00:00Z" }));
		const newer = parseNewsView(news());
		const sorted = [older, newer].flatMap((v) => v ?? []).toSorted(newestFirst);
		expect(sorted.map((v) => v.publishedAt.toString())).toEqual([
			"2026-11-20T15:00:00Z",
			"2026-10-01T00:00:00Z",
		]);
	});
});

describe("query filters", () => {
	const lodge = fixtureBody("blue-lodge", 1);
	const chapter = fixtureBody("chapter", 2);

	it("reads ?tag= against the body's vocabulary (FR-3.3)", () => {
		expect(chosenTag("Social", lodge)).toEqual({ slug: "social", label: "Social" });
		expect(chosenTag("unknown", lodge)).toBeNull();
		expect(chosenTag(null, lodge)).toBeNull();
	});

	it("reads ?body= slugs against the published bodies, in body order (FR-3.4, 4.4)", () => {
		expect(chosenBodies(["chapter", "nope", "blue-lodge"], [lodge, chapter])).toEqual([
			lodge,
			chapter,
		]);
		expect(chosenBodies([], [lodge, chapter])).toEqual([]);
	});
});
