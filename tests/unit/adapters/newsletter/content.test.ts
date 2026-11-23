import { parseBodies, parseNewsCandidate, type ListedItem } from "@adapters/newsletter/content";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, entryId, instant } from "../../fixtures";

const ORIGIN = "https://findlaymason.org";
const slugs = new Map([[LODGE, "blue-lodge"]]);

function newsItem(data: Record<string, unknown>, extra: Partial<ListedItem> = {}): ListedItem {
	return {
		id: entryId(1),
		slug: "degree-night",
		publishedAt: "2027-03-02T00:00:00.000Z",
		data: {
			body: LODGE,
			title: " Degree night ",
			content: [{ _type: "block", children: [{ _type: "span", text: "Third degree." }] }, "junk"],
			publish_date: "2027-03-01T12:00:00.000Z",
			...data,
		},
		...extra,
	};
}

describe("news items as newsletter candidates (FR-6.1)", () => {
	it("links each article to its own page under its body (R8) and makes its image absolute", () => {
		const candidate = parseNewsCandidate(
			newsItem({ featured_image: { src: "/_emdash/api/media/file/a.jpg", alt: "Officers" } }),
			slugs,
			ORIGIN,
		);
		expect(candidate).toMatchObject({
			id: entryId(1),
			body: LODGE,
			title: "Degree night",
			href: "https://findlaymason.org/bodies/blue-lodge/news/degree-night",
			image: { src: "https://findlaymason.org/_emdash/api/media/file/a.jpg", alt: "Officers" },
			includeInNewsletter: true,
		});
		expect(candidate?.publishedAt).toEqual(instant("2027-03-01T12:00:00Z"));
		expect(candidate?.content).toHaveLength(1);
	});

	it("keeps an item out of the newsletter only when it says so", () => {
		expect(
			parseNewsCandidate(newsItem({ include_in_newsletter: false }), slugs, ORIGIN),
		).toMatchObject({
			includeInNewsletter: false,
		});
	});

	it("falls back to the publish time EmDash recorded, and drops an image without a source", () => {
		const candidate = parseNewsCandidate(
			newsItem({ publish_date: undefined, featured_image: { alt: "x" } }),
			slugs,
			ORIGIN,
		);
		expect(candidate?.publishedAt).toEqual(instant("2027-03-02T00:00:00Z"));
		expect(candidate?.image).toBeNull();
	});

	it.each([
		["no title", { title: "  " }],
		["a body that is not listed", { body: CHAPTER }],
		["no body", { body: undefined }],
		["no publish date", { publish_date: "soon" }],
	])("skips an item with %s", (_, data) => {
		expect(parseNewsCandidate(newsItem(data, { publishedAt: null }), slugs, ORIGIN)).toBeNull();
	});

	it("reads bodies with their names, order and page slugs", () => {
		const listing = parseBodies([
			{
				id: LODGE,
				slug: "blue-lodge",
				publishedAt: null,
				data: { name: "Findlay Lodge", number: 227, display_order: 1 },
			},
			{ id: "not-a-ulid", slug: "x", publishedAt: null, data: { name: "Broken" } },
		]);
		expect(listing.bodies).toEqual([{ id: LODGE, name: "Findlay Lodge No. 227", displayOrder: 1 }]);
		expect([...listing.slugs]).toEqual([[LODGE, "blue-lodge"]]);
	});
});
