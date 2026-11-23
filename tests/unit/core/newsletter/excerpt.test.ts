import { excerpt, type PortableTextBlock } from "@core/newsletter/excerpt";
import { describe, expect, it } from "vitest";

const block = (...texts: string[]): PortableTextBlock => ({
	_type: "block",
	children: texts.map((text) => ({ _type: "span", text })),
});

describe("excerpt", () => {
	it("joins the text of text blocks and skips other block types", () => {
		const blocks: PortableTextBlock[] = [
			block("The Lodge ", "met on Tuesday."),
			{ _type: "image" },
			{ _type: "block" },
			{ _type: "block", children: [{ _type: "inlineIcon" }] },
			block("Dinner   followed."),
		];
		expect(excerpt(blocks)).toBe("The Lodge met on Tuesday. Dinner followed.");
	});

	it("returns short text unchanged and empty content as an empty string", () => {
		expect(excerpt([block("Short.")])).toBe("Short.");
		expect(excerpt([])).toBe("");
	});

	it("cuts long text at a word boundary to at most 200 characters, with an ellipsis", () => {
		const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
		const cut = excerpt([block(words)]);
		expect(cut.length).toBeLessThanOrEqual(200);
		expect(cut.endsWith("…")).toBe(true);
		expect(words.startsWith(cut.slice(0, -1))).toBe(true);
		expect(words.charAt(cut.length - 1)).toBe(" ");
	});

	it("keeps a word that ends exactly at the limit", () => {
		expect(excerpt([block("aaaa bbbb cccc")], 10)).toBe("aaaa bbbb…");
	});

	it("hard-cuts a single word longer than the limit", () => {
		expect(excerpt([block("x".repeat(50))], 10)).toBe(`${"x".repeat(9)}…`);
	});
});
