import { canonicalNewsSitemap } from "@adapters/site/sitemap";
import { describe, expect, it } from "vitest";

const url = (loc: string, extra = "") =>
	`  <url>\n    <loc>${loc}</loc>\n    <lastmod>2026-11-20T10:00:00.000Z</lastmod>\n${extra}  </url>\n`;

const sitemap = (...urls: string[]) =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
		...urls.map((u) => u.trimEnd()),
		"</urlset>",
	].join("\n");

const homes = new Map([
	["spring-banquet", "council"],
	["fish-fry", "blue-lodge"],
]);

describe("canonicalNewsSitemap (M4 verification N3, N4)", () => {
	it("lists each news item at its page under its body, not at the /news redirect", () => {
		const out = canonicalNewsSitemap(
			sitemap(
				url("https://findlaymason.org/news/spring-banquet"),
				url("https://findlaymason.org/news/fish-fry"),
			),
			homes,
		);
		expect(out).toContain("<loc>https://findlaymason.org/bodies/council/news/spring-banquet</loc>");
		expect(out).toContain("<loc>https://findlaymason.org/bodies/blue-lodge/news/fish-fry</loc>");
		expect(out).not.toContain("findlaymason.org/news/");
		expect(out.match(/<lastmod>/g)).toHaveLength(2);
	});

	it("leaves out an item whose body is not published, and one it cannot place", () => {
		const out = canonicalNewsSitemap(
			sitemap(
				url("https://findlaymason.org/news/spring-banquet"),
				url("https://findlaymason.org/news/retired-body-picnic"),
			),
			homes,
		);
		expect(out).not.toContain("retired-body-picnic");
		expect(out.match(/<url>/g)).toHaveLength(1);
		expect(out).toMatch(/^<\?xml[\s\S]*<\/urlset>$/);
	});

	it("keeps an item's image and any URL that is not a news redirect as EmDash wrote it", () => {
		const image =
			"    <image:image>\n      <image:loc>https://findlaymason.org/_emdash/api/media/file/a.jpg</image:loc>\n    </image:image>\n";
		const out = canonicalNewsSitemap(
			sitemap(
				url("https://findlaymason.org/news/fish-fry", image),
				url("https://findlaymason.org/about"),
			),
			homes,
		);
		expect(out).toContain(
			"<image:loc>https://findlaymason.org/_emdash/api/media/file/a.jpg</image:loc>",
		);
		expect(out).toContain("<loc>https://findlaymason.org/about</loc>");
	});

	it("decodes and re-encodes slugs, and escapes the new URL for XML", () => {
		const out = canonicalNewsSitemap(
			sitemap(url("https://findlaymason.org/news/caf%C3%A9-night")),
			new Map([["café-night", "eastern-star"]]),
		);
		expect(out).toContain(
			"<loc>https://findlaymason.org/bodies/eastern-star/news/caf%C3%A9-night</loc>",
		);
	});
});
