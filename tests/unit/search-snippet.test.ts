import { describe, expect, it } from "vitest";
import { parseSnippet, segmentsText } from "../../src/utils/search-snippet";

describe("parseSnippet", () => {
	it("splits marked and plain text into segments", () => {
		expect(parseSnippet("a <mark>Lodge</mark> meeting")).toEqual([
			{ text: "a ", marked: false },
			{ text: "Lodge", marked: true },
			{ text: " meeting", marked: false },
		]);
	});

	it("unescapes entities so the template escapes them exactly once", () => {
		expect(segmentsText(parseSnippet("&lt;b&gt; &amp; &quot;x&quot; &#39;y&#39;"))).toBe(
			`<b> & "x" 'y'`,
		);
	});

	it("keeps escaped markup as text, never as a highlight", () => {
		expect(parseSnippet("&lt;mark&gt;x&lt;/mark&gt;")).toEqual([
			{ text: "<mark>x</mark>", marked: false },
		]);
	});
});
