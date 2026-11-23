import { cacheRoute } from "@adapters/site/cache";
import { loadBodies, loadCalendar } from "@adapters/site/content";
import { calendarResponse } from "@adapters/site/feed";
import type { APIRoute } from "astro";
import { getSiteSettingsWithCacheHint } from "emdash";
import { resolveSiteIdentity } from "../utils/site-identity";

/** FR-4.5: every body's events. */
export const GET: APIRoute = async ({ url, cache }) => {
	const [bodies, settings] = await Promise.all([loadBodies(), getSiteSettingsWithCacheHint()]);
	const calendar = await loadCalendar(bodies.value);
	cacheRoute(cache, [bodies.hint, settings.cacheHint, calendar.hint]);
	const { siteTitle } = resolveSiteIdentity(settings.data);
	return calendarResponse(siteTitle, calendar.value, url, "findlay-masonic-temple.ics");
};
