import { cacheRoute } from "@adapters/site/cache";
import { loadBody, loadCalendar } from "@adapters/site/content";
import { calendarResponse } from "@adapters/site/feed";
import type { APIRoute } from "astro";
import { decodeSlug } from "emdash";

/** FR-4.5: one body's events. */
export const GET: APIRoute = async ({ params, url, cache, rewrite }) => {
	const slug = decodeSlug(params.slug);
	const { value: body, hint } = slug ? await loadBody(slug) : { value: null, hint: {} };
	if (body === null) return rewrite("/404");
	const calendar = await loadCalendar([body]);
	cacheRoute(cache, [hint, calendar.hint]);
	return calendarResponse(body.displayName, calendar.value, url, `${body.slug}.ics`);
};
