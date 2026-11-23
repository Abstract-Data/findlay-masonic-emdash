import { Temporal } from "temporal-polyfill";
import type { AbsoluteUrl, BodyId, EntryId } from "../ids";
import { formatOccurrence } from "../recurrence/describe";
import type { Occurrence } from "../recurrence/series";
import { SITE_TZ, formatDate } from "../time";
import { excerpt, type PortableTextBlock } from "./excerpt";
import {
	NODE,
	UPCOMING_EVENTS_HEADING,
	type ArticleCardNode,
	type BodySectionNode,
	type EventListNode,
	type HeadingNode,
	type IssueDoc,
} from "./nodes";
import type { IssueWindow } from "./window";

export interface BodySummary {
	readonly id: BodyId;
	readonly name: string;
	readonly displayOrder: number;
}

export interface NewsCandidate {
	readonly id: EntryId;
	readonly body: BodyId;
	readonly title: string;
	readonly content: readonly PortableTextBlock[];
	readonly href: AbsoluteUrl;
	readonly image: { readonly src: AbsoluteUrl; readonly alt: string } | null;
	readonly publishedAt: Temporal.Instant;
	readonly includeInNewsletter: boolean;
}

export interface AssemblyInput {
	readonly bodies: readonly BodySummary[];
	readonly news: readonly NewsCandidate[];
	/** Already expanded by the caller, normally over daysAhead(now, 60). */
	readonly occurrences: readonly Occurrence[];
	readonly window: IssueWindow;
}

export interface Assembly {
	readonly doc: IssueDoc;
	readonly counts: {
		readonly sections: number;
		readonly articles: number;
		readonly events: number;
	};
}

const EMPTY_ISSUE_TEXT = "No body news or upcoming events for this issue yet.";

/** FR-6.1: one section per body in display order, articles newest first, then events. */
export function assemble(input: AssemblyInput): Assembly {
	const { from, to } = input.window;
	const inWindow = (news: NewsCandidate) =>
		news.includeInNewsletter &&
		Temporal.Instant.compare(news.publishedAt, from) > 0 &&
		Temporal.Instant.compare(news.publishedAt, to) <= 0;

	const groups = input.bodies
		.toSorted(byDisplayOrder)
		.map((body) => ({
			body,
			cards: input.news
				.filter((news) => news.body === body.id && inWindow(news))
				.toSorted((a, b) => Temporal.Instant.compare(b.publishedAt, a.publishedAt))
				.map(articleCard),
			upcoming: input.occurrences.filter((o) => o.body === body.id),
		}))
		.filter((group) => group.cards.length > 0 || group.upcoming.length > 0);
	const sections = groups.map((group) => section(group.body, group.cards, group.upcoming));
	const total = (count: (group: (typeof groups)[number]) => number) =>
		groups.reduce((sum, group) => sum + count(group), 0);

	return {
		doc: {
			type: "doc",
			content: [
				{
					type: "container",
					content:
						sections.length > 0
							? sections
							: [{ type: "paragraph", content: [{ type: "text", text: EMPTY_ISSUE_TEXT }] }],
				},
			],
		},
		counts: {
			sections: sections.length,
			articles: total((group) => group.cards.length),
			events: total((group) => group.upcoming.length),
		},
	};
}

function byDisplayOrder(a: BodySummary, b: BodySummary): number {
	return a.displayOrder - b.displayOrder || (a.name < b.name ? -1 : Number(a.name > b.name));
}

function section(
	body: BodySummary,
	cards: readonly ArticleCardNode[],
	upcoming: readonly Occurrence[],
): BodySectionNode {
	const heading = headingNode(2, body.name);
	return {
		type: NODE.section,
		attrs: { bodyId: body.id, heading: body.name },
		content:
			upcoming.length === 0
				? [heading, ...cards]
				: [heading, ...cards, headingNode(3, UPCOMING_EVENTS_HEADING), eventList(upcoming)],
	};
}

function headingNode(level: 2 | 3, text: string): HeadingNode {
	return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}

function articleCard(news: NewsCandidate): ArticleCardNode {
	return {
		type: NODE.card,
		attrs: {
			newsId: news.id,
			title: news.title,
			excerpt: excerpt(news.content),
			href: news.href,
			imageSrc: news.image?.src ?? null,
			imageAlt: news.image?.alt ?? "",
			publishedOn: formatDate(news.publishedAt.toZonedDateTimeISO(SITE_TZ).toPlainDate()),
		},
	};
}

export function eventList(upcoming: readonly Occurrence[]): EventListNode {
	return {
		type: "bulletList",
		content: upcoming.map((o) => ({
			type: "listItem",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: `${formatOccurrence(o)} · ${o.title}` }],
				},
			],
		})),
	};
}
