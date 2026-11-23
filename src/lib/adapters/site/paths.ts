/** Every public route the pages, feeds and newsletter link to, so a link cannot drift from its page. */
const segment = (slug: string) => encodeURIComponent(slug);

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
