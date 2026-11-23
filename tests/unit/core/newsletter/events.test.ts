import { assemble, type BodySummary } from "@core/newsletter/assemble";
import { refreshEvents } from "@core/newsletter/events";
import { NODE, UPCOMING_EVENTS_HEADING, type DocNode } from "@core/newsletter/nodes";
import type { IssueWindow } from "@core/newsletter/window";
import { daysAhead, expand } from "@core/recurrence/expand";
import type { EventSeries } from "@core/recurrence/series";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, entryId, instant, series, timed } from "../../fixtures";

const now = instant("2027-04-15T14:00:00Z");
const window: IssueWindow = { kind: "first", from: instant("2027-01-15T15:00:00Z"), to: now };
const bodies: BodySummary[] = [
	{ id: LODGE, name: "Findlay Lodge No. 227", displayOrder: 1 },
	{ id: CHAPTER, name: "Findlay Chapter No. 58", displayOrder: 2 },
];
const stated = series({
	body: LODGE,
	timing: timed("2027-01-12T19:30", "2027-01-12T21:30"),
	rrule: "FREQ=MONTHLY;BYDAY=2TU",
});
const tableLodge = series({
	id: entryId(7),
	body: LODGE,
	title: "Table Lodge",
	timing: timed("2027-05-01T18:00", "2027-05-01T21:00"),
});
const convocation = series({
	id: entryId(8),
	body: CHAPTER,
	title: "Chapter Convocation",
	timing: timed("2027-04-20T19:00", "2027-04-20T21:00"),
});

const upcoming = (...list: EventSeries[]) => expand(list, daysAhead(now, 60));
const assembled = assemble({
	bodies,
	news: [],
	occurrences: upcoming(stated, convocation),
	window,
}).doc;

const textOf = (node: DocNode): string =>
	(node.text ?? "") + (node.content ?? []).map(textOf).join("");

function eventLines(doc: DocNode, heading: string): string[] | null {
	const section = doc.content?.[0]?.content?.find((node) => node.attrs?.heading === heading);
	const list = section?.content?.find((node) => node.type === "bulletList");
	return list === undefined ? null : (list.content ?? []).map(textOf);
}

describe("refreshEvents (R13)", () => {
	it("changes nothing while each body's events are the same", () => {
		const refreshed = refreshEvents(assembled, upcoming(stated, convocation));
		expect(refreshed).toEqual({ doc: assembled, changed: false });
	});

	it("rewrites a body's list when an event was added since assembly", () => {
		const refreshed = refreshEvents(assembled, upcoming(stated, tableLodge, convocation));
		expect(refreshed.changed).toBe(true);
		expect(eventLines(refreshed.doc, "Findlay Lodge No. 227")).toEqual([
			"Sat, May 1, 6:00 PM · Table Lodge",
			"Tue, May 11, 7:30 PM · Stated Meeting",
			"Tue, Jun 8, 7:30 PM · Stated Meeting",
		]);
		expect(eventLines(refreshed.doc, "Findlay Chapter No. 58")).toEqual([
			"Tue, Apr 20, 7:00 PM · Chapter Convocation",
		]);
	});

	it("removes the heading and list of a body with no events left", () => {
		const refreshed = refreshEvents(assembled, upcoming(stated));
		expect(refreshed.changed).toBe(true);
		expect(eventLines(refreshed.doc, "Findlay Chapter No. 58")).toBeNull();
		const headings = JSON.stringify(refreshed.doc).split(UPCOMING_EVENTS_HEADING).length - 1;
		expect(headings).toBe(1);
	});

	it("leaves a section whose event list the Admin deleted, and nodes outside sections", () => {
		const lodgeOnly: DocNode = {
			type: "doc",
			content: [
				{
					type: "container",
					content: [
						{ type: "paragraph", content: [{ type: "text", text: "Brethren," }] },
						{
							type: NODE.section,
							attrs: { bodyId: LODGE, heading: "Findlay Lodge No. 227" },
							content: [
								{
									type: "heading",
									attrs: { level: 2 },
									content: [{ type: "text", text: "Findlay Lodge No. 227" }],
								},
							],
						},
					],
				},
			],
		};
		expect(refreshEvents(lodgeOnly, upcoming(stated, tableLodge))).toEqual({
			doc: lodgeOnly,
			changed: false,
		});
	});

	it("keeps a list the editor restyled when its lines still match", () => {
		const restyle = (node: DocNode): DocNode => ({
			...node,
			...(node.type === "bulletList" ? { attrs: { style: "color:red" } } : {}),
			...(node.content === undefined ? {} : { content: node.content.map(restyle) }),
		});
		const styled = restyle(assembled);
		expect(refreshEvents(styled, upcoming(stated, convocation))).toEqual({
			doc: styled,
			changed: false,
		});
	});
});
