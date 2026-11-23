import type { AbsoluteUrl, BodyId, EntryId } from "../ids";

/**
 * TipTap node names shared with the M5 editor's EmailNode extensions, which import
 * these names and attribute shapes so assembled drafts and the editor cannot drift.
 */
export const NODE = { section: "bodySection", card: "articleCard" } as const;

/** The level-3 heading that opens a section's event list, which approve re-reads (R13). */
export const UPCOMING_EVENTS_HEADING = "Upcoming events";

/** Every attribute of each custom node with its default, so the editor declares exactly these. */
export const SECTION_ATTR_DEFAULTS = { bodyId: "", heading: "" } as const satisfies Record<
	keyof BodySectionNode["attrs"],
	string
>;

export const CARD_ATTR_DEFAULTS = {
	newsId: "",
	title: "",
	excerpt: "",
	href: "",
	imageSrc: null,
	imageAlt: "",
	publishedOn: "",
} as const satisfies Record<keyof ArticleCardAttrs, string | null>;

/**
 * Any node of a saved issue. The editor adds attributes (style, alignment) on load and the
 * Admin may add any node it offers, so a saved document is read through this shape.
 */
export interface DocNode {
	readonly type: string;
	readonly attrs?: Readonly<Record<string, unknown>>;
	readonly content?: readonly DocNode[];
	readonly text?: string;
	readonly marks?: readonly unknown[];
}

// A type alias, not an interface, so a card is also a DocNode (its attrs a plain record).
export type ArticleCardAttrs = {
	readonly newsId: EntryId;
	readonly title: string;
	readonly excerpt: string;
	readonly href: AbsoluteUrl;
	readonly imageSrc: AbsoluteUrl | null;
	readonly imageAlt: string;
	/** "Mar 9, 2027" in SITE_TZ. */
	readonly publishedOn: string;
};

export interface TextNode {
	readonly type: "text";
	readonly text: string;
}

export interface HeadingNode {
	readonly type: "heading";
	readonly attrs: { readonly level: 2 | 3 };
	readonly content: readonly [TextNode];
}

export interface ParagraphNode {
	readonly type: "paragraph";
	readonly content?: readonly TextNode[];
}

export interface ArticleCardNode {
	readonly type: typeof NODE.card;
	readonly attrs: ArticleCardAttrs;
}

export interface EventListNode {
	readonly type: "bulletList";
	readonly content: readonly {
		readonly type: "listItem";
		readonly content: readonly [ParagraphNode];
	}[];
}

export interface BodySectionNode {
	readonly type: typeof NODE.section;
	readonly attrs: { readonly bodyId: BodyId; readonly heading: string };
	readonly content:
		| readonly [HeadingNode, ...ArticleCardNode[]]
		| readonly [HeadingNode, ...ArticleCardNode[], HeadingNode, EventListNode];
}

/** The 1.8.10 editor wraps any doc whose root lacks a `container`, so the root has one. */
export interface IssueDoc {
	readonly type: "doc";
	readonly content: readonly [
		{
			readonly type: "container";
			readonly content: readonly BodySectionNode[] | readonly [ParagraphNode];
		},
	];
}
