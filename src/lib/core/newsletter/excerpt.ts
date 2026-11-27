/** The slice of a Portable Text block that excerpts read. Other block types are skipped. */
export interface PortableTextBlock {
	readonly _type: string;
	readonly children?: readonly { readonly _type: string; readonly text?: string }[];
}

const DEFAULT_MAX = 200;

/** Plain text of the text blocks, cut at a word boundary to at most `max` characters. */
export function excerpt(blocks: readonly PortableTextBlock[], max = DEFAULT_MAX): string {
	const text = blocks
		.filter((block) => block._type === "block")
		.map((block) => (block.children ?? []).map((child) => child.text ?? "").join(""))
		.join(" ")
		.replaceAll(/\s+/g, " ")
		.trim();
	if (text.length <= max) return text;
	const boundary = text.lastIndexOf(" ", max - 1);
	return `${text.slice(0, boundary > 0 ? boundary : max - 1)}…`;
}
