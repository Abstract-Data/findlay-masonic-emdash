import { loadBodies, loadNewsHomes } from "@adapters/site/content";
import { canonicalNewsSitemap } from "@adapters/site/sitemap";
import type { APIRoute } from "astro";
import { GET as emdashSitemap } from "emdash/internal/routes/sitemap-_collection_.xml";

export const prerender = false;

const NEWS_SITEMAP = /^news(?:-\d+)?$/;

/**
 * EmDash's per-collection sitemap, which this file replaces (EmDash injects its own only when
 * the site defines none). Every collection's sitemap is EmDash's; the news sitemap's URLs are
 * moved to each item's page under its body, and items of an unpublished body are left out
 * (M4 verification N3, N4).
 */
export const GET: APIRoute = async (context) => {
	const response = await emdashSitemap(context);
	if (!response.ok || !NEWS_SITEMAP.test(context.params.collection ?? "")) return response;
	const xml = await response.text();
	const homes = await loadNewsHomes((await loadBodies()).value);
	return new Response(canonicalNewsSitemap(xml, homes), {
		status: response.status,
		headers: response.headers,
	});
};
