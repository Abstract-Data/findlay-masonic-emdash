/** Every public route the pages, feeds and newsletter link to, so a link cannot drift from its page. */
const segment = (slug: string) => encodeURIComponent(slug);

/**
 * A route's slug parameter, the way `paths` encoded it. Astro decodes the path before it
 * matches a route, so decoding the parameter again (EmDash's `decodeSlug`) breaks any slug
 * holding a `%`: `pct%zz` throws and the page answers 404 (M7 review L8).
 */
export function slugParam(param: string | undefined): string | undefined {
	return param === "" ? undefined : param;
}

export const paths = {
	home: "/",
	bodies: "/bodies",
	body: (body: string) => `/bodies/${segment(body)}`,
	bodyNews: (body: string) => `/bodies/${segment(body)}/news`,
	/** R8: the page newsletter article cards link to. */
	newsItem: (body: string, news: string) => `/bodies/${segment(body)}/news/${segment(news)}`,
	bodyCalendar: (body: string) => `/bodies/${segment(body)}/calendar`,
	bodyFeed: (body: string) => `/bodies/${segment(body)}/calendar.ics`,
	news: "/news",
	calendar: "/calendar",
	feed: "/calendar.ics",
	page: (page: string) => `/pages/${segment(page)}`,
} as const;
