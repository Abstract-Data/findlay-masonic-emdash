import type { AbsoluteUrl, BodyId, EntryId } from "../ids";

/**
 * TipTap node names shared with the M5 editor's EmailNode extensions, which import
 * these names and attribute shapes so assembled drafts and the editor cannot drift.
 */
export const NODE = { section: "bodySection", card: "articleCard" } as const;

export interface ArticleCardAttrs {
	readonly newsId: EntryId;
	readonly title: string;
	readonly excerpt: string;
	readonly href: AbsoluteUrl;
	readonly imageSrc: AbsoluteUrl | null;
	readonly imageAlt: string;
	/** "Mar 9, 2027" in SITE_TZ. */
	readonly publishedOn: string;
}

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
