import { paths } from "./paths";

const URL_BLOCK = /<url>[\s\S]*?<\/url>\n?/g;
const LOC = /<loc>([^<]*)<\/loc>/;
const NEWS_LOC = /^\/news\/([^/]+)$/;

const unescapeXml = (text: string) =>
	text
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");

const escapeXml = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");

/**
 * EmDash's news sitemap, with each item at its canonical page. EmDash builds news URLs from the
 * collection's URL pattern, `/news/{slug}`, which cannot name the body and only redirects
 * (M4 verification N4), and it lists every published item, even one whose body is not
 * published, so its page does not exist (N3). Each `<url>` is moved to
 * `/bodies/<body>/news/<slug>`, or dropped when `homes` (news slug to the slug of its
 * published body) has no home for it. Everything else EmDash wrote is kept as it was.
 */
export function canonicalNewsSitemap(xml: string, homes: ReadonlyMap<string, string>): string {
	return xml.replaceAll(URL_BLOCK, (block) => {
		const loc = LOC.exec(block)?.[1];
		if (loc === undefined || !URL.canParse(unescapeXml(loc))) return block;
		const url = new URL(unescapeXml(loc));
		const slug = NEWS_LOC.exec(url.pathname)?.[1];
		if (slug === undefined) return block;
		const decoded = decodeURIComponent(slug);
		const body = homes.get(decoded);
		if (body === undefined) return "";
		const canonical = new URL(paths.newsItem(body, decoded), url.origin).href;
		return block.replace(LOC, `<loc>${escapeXml(canonical)}</loc>`);
	});
}
