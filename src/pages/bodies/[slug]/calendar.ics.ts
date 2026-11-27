import { cacheRoute } from "@adapters/site/cache";
import { loadBody, loadCalendar } from "@adapters/site/content";
import { slugParam } from "@adapters/site/paths";
import { calendarResponse } from "@adapters/site/feed";
import type { APIRoute } from "astro";

/** FR-4.5: one body's events. */
export const GET: APIRoute = async ({ params, url, cache, rewrite }) => {
	const slug = slugParam(params.slug);
	const { value: body, hint } = slug ? await loadBody(slug) : { value: null, hint: {} };
	if (body === null) return rewrite("/404");
	const calendar = await loadCalendar([body]);
	cacheRoute(cache, [hint, calendar.hint]);
	return calendarResponse(body.displayName, calendar.value, url, `${body.slug}.ics`);
};
