import { pageSeo } from "@adapters/site/seo";
import { describe, expect, it } from "vitest";

const page = {
	siteTitle: "Findlay Masonic Temple",
	origin: "https://findlaymason.org",
	path: "/bodies/council",
	title: "Findlay Council No. 50",
	fallback: "Findlay Council No. 50 at the Findlay Masonic Temple.",
};
const text = [
	{ _type: "block", children: [{ _type: "span", text: "Cryptic Masons meet monthly." }] },
];

describe("pageSeo (M4 verification B1)", () => {
	it("titles a body by its name and describes it by its text, though bodies have no title field", () => {
		const seo = pageSeo({ data: { name: "Council" } }, { ...page, text });
		expect(seo).toMatchObject({
			title: "Findlay Council No. 50 — Findlay Masonic Temple",
			description: "Cryptic Masons meet monthly.",
			canonical: "https://findlaymason.org/bodies/council",
		});
	});

	it("falls back to a sentence when the text is empty", () => {
		expect(pageSeo({ data: {} }, { ...page, text: [] }).description).toBe(page.fallback);
	});

	it("lets the SEO panel win", () => {
		const seo = pageSeo(
			{
				data: {
					seo: {
						title: "Council",
						description: "Set by an editor",
						image: null,
						canonical: null,
						noIndex: false,
					},
				},
			},
			{ ...page, text },
		);
		expect(seo).toMatchObject({
			title: "Council — Findlay Masonic Temple",
			description: "Set by an editor",
		});
	});
});
