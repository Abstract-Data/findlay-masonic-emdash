import { assemble, type BodySummary, type NewsCandidate } from "@core/newsletter/assemble";
import { NODE } from "@core/newsletter/nodes";
import type { IssueWindow } from "@core/newsletter/window";
import { daysAhead, expand } from "@core/recurrence/expand";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, bodyId, entryId, instant, series, timed, url } from "../../fixtures";

const COUNCIL = bodyId(3);
const bodies: BodySummary[] = [
	{ id: CHAPTER, name: "Findlay Chapter No. 58", displayOrder: 2 },
	{ id: COUNCIL, name: "Findlay Council No. 50", displayOrder: 3 },
	{ id: LODGE, name: "Findlay Lodge No. 227", displayOrder: 1 },
];
const now = instant("2027-04-15T14:00:00Z");
const window: IssueWindow = { kind: "first", from: instant("2027-01-15T15:00:00Z"), to: now };

function news(
	n: number,
	body: typeof LODGE,
	publishedAt: string,
	extra: Partial<NewsCandidate> = {},
): NewsCandidate {
	return {
		id: entryId(n),
		body,
		title: `News ${n}`,
		content: [{ _type: "block", children: [{ _type: "span", text: `Body of news ${n}.` }] }],
		href: url(`https://findlaymason.org/news/${n}`),
		image: null,
		publishedAt: instant(publishedAt),
		includeInNewsletter: true,
		...extra,
	};
}

const upcoming = expand(
	[
		series({
			body: LODGE,
			timing: timed("2027-01-12T19:30", "2027-01-12T21:30"),
			rrule: "FREQ=MONTHLY;BYDAY=2TU",
		}),
	],
	daysAhead(now, 60),
);

describe("assemble (FR-6.1)", () => {
	it("builds one section per body in display order with articles newest first, then events", () => {
		const { doc, counts } = assemble({
			bodies,
			news: [
				news(1, LODGE, "2027-02-01T12:00:00Z"),
				news(2, CHAPTER, "2027-03-01T12:00:00Z", {
					image: { src: url("https://findlaymason.org/media/2.jpg"), alt: "Officers" },
				}),
				news(3, LODGE, "2027-04-01T12:00:00Z"),
			],
			occurrences: upcoming,
			window,
		});
		expect(counts).toEqual({ sections: 2, articles: 3, events: 2 });
		expect(doc).toEqual({
			type: "doc",
			content: [
				{
					type: "container",
					content: [
						{
							type: NODE.section,
							attrs: { bodyId: LODGE, heading: "Findlay Lodge No. 227" },
							content: [
								{
									type: "heading",
									attrs: { level: 2 },
									content: [{ type: "text", text: "Findlay Lodge No. 227" }],
								},
								{
									type: NODE.card,
									attrs: {
										newsId: entryId(3),
										title: "News 3",
										excerpt: "Body of news 3.",
										href: "https://findlaymason.org/news/3",
										imageSrc: null,
										imageAlt: "",
										publishedOn: "Apr 1, 2027",
									},
								},
								expect.objectContaining({
									type: NODE.card,
									attrs: expect.objectContaining({ newsId: entryId(1) }),
								}),
								{
									type: "heading",
									attrs: { level: 3 },
									content: [{ type: "text", text: "Upcoming events" }],
								},
								{
									type: "bulletList",
									content: [
										{
											type: "listItem",
											content: [
												{
													type: "paragraph",
													content: [
														{ type: "text", text: "Tue, May 11, 7:30 PM · Stated Meeting" },
													],
												},
											],
										},
										{
											type: "listItem",
											content: [
												{
													type: "paragraph",
													content: [{ type: "text", text: "Tue, Jun 8, 7:30 PM · Stated Meeting" }],
												},
											],
										},
									],
								},
							],
						},
						{
							type: NODE.section,
							attrs: { bodyId: CHAPTER, heading: "Findlay Chapter No. 58" },
							content: [
								{
									type: "heading",
									attrs: { level: 2 },
									content: [{ type: "text", text: "Findlay Chapter No. 58" }],
								},
								{
									type: NODE.card,
									attrs: expect.objectContaining({
										imageSrc: "https://findlaymason.org/media/2.jpg",
										imageAlt: "Officers",
									}),
								},
							],
						},
					],
				},
			],
		});
	});

	it("includes news published after the window start up to and including its end", () => {
		const { counts } = assemble({
			bodies,
			news: [
				news(1, LODGE, "2027-01-15T15:00:00Z"),
				news(2, LODGE, "2027-01-15T15:00:01Z"),
				news(3, LODGE, "2027-04-15T14:00:00Z"),
				news(4, LODGE, "2027-04-15T14:00:01Z"),
			],
			occurrences: [],
			window,
		});
		expect(counts.articles).toBe(2);
	});

	it("leaves out news opted out of the newsletter and news of unknown bodies", () => {
		const { counts } = assemble({
			bodies,
			news: [
				news(1, LODGE, "2027-02-01T12:00:00Z", { includeInNewsletter: false }),
				news(2, bodyId(99), "2027-02-01T12:00:00Z"),
			],
			occurrences: [],
			window,
		});
		expect(counts).toEqual({ sections: 0, articles: 0, events: 0 });
	});

	it("orders bodies with the same display order by name", () => {
		const tied: BodySummary[] = [
			{ id: CHAPTER, name: "Beta", displayOrder: 1 },
			{ id: COUNCIL, name: "Alpha", displayOrder: 1 },
			{ id: LODGE, name: "Alpha", displayOrder: 1 },
		];
		const { doc } = assemble({
			bodies: tied,
			news: [
				news(1, CHAPTER, "2027-02-01T12:00:00Z"),
				news(2, COUNCIL, "2027-02-01T12:00:00Z"),
				news(3, LODGE, "2027-02-01T12:00:00Z"),
			],
			occurrences: [],
			window,
		});
		const headings = doc.content[0].content.map((node) =>
			"attrs" in node ? node.attrs.heading : "",
		);
		expect(headings).toEqual(["Alpha", "Alpha", "Beta"]);
	});

	it("holds one paragraph and zero counts when nothing qualifies", () => {
		expect(assemble({ bodies, news: [], occurrences: [], window })).toEqual({
			doc: {
				type: "doc",
				content: [
					{
						type: "container",
						content: [
							{
								type: "paragraph",
								content: [
									{ type: "text", text: "No body news or upcoming events for this issue yet." },
								],
							},
						],
					},
				],
			},
			counts: { sections: 0, articles: 0, events: 0 },
		});
	});
});
