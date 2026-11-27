import { NEWS_PAGE_SIZE, pageOf, parsePage } from "@core/news/paging";
import { describe, expect, it } from "vitest";

const items = Array.from({ length: 23 }, (_, i) => i + 1);

describe("news pages (FR-3.3)", () => {
	it("shows ten to a page", () => {
		expect(NEWS_PAGE_SIZE).toBe(10);
		expect(pageOf(items, 1)).toEqual({
			items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
			page: 1,
			hasNewer: false,
			hasOlder: true,
		});
	});

	it("links both ways from a middle page, and only back from the last", () => {
		expect(pageOf(items, 2)).toMatchObject({ hasNewer: true, hasOlder: true });
		expect(pageOf(items, 3)).toEqual({
			items: [21, 22, 23],
			page: 3,
			hasNewer: true,
			hasOlder: false,
		});
	});

	it("has no older page when the list fills the page exactly", () => {
		expect(pageOf(items.slice(0, 10), 1).hasOlder).toBe(false);
	});

	it.each([
		["2", 2],
		[null, 1],
		["0", 1],
		["-1", 1],
		["1.5", 1],
		["abc", 1],
		["99999", 1],
	])("reads ?page=%s as page %s", (raw, page) => {
		expect(parsePage(raw)).toBe(page);
	});
});
