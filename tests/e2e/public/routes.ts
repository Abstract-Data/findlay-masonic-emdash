import { addDays, addMonths, findlayToday } from "./site";

const today = findlayToday();
const month = addMonths(today, 2);
// Two weeks on, the Temple Board has nothing: the home page's quiet-week notice.
const quietWeek = addDays(today, 14 - new Date(`${today}T12:00:00Z`).getUTCDay());

/**
 * The public routes every page-wide check visits (axe, sideways scrolling), once the public
 * suites have given their lists content. A news item's and a newsletter issue's own pages have
 * generated slugs, so each check finds those itself.
 */
export const PUBLIC_ROUTES = [
	"/",
	"/?body=council",
	`/?week=${quietWeek}&body=temple-board`,
	"/bodies",
	"/bodies/commandery",
	"/bodies/temple-board",
	"/bodies/council?contact=sent",
	"/bodies/eastern-star/news",
	"/bodies/eastern-star/news?tag=e2e-ritual",
	"/news",
	"/news?body=temple-board",
	`/calendar?month=${month}`,
	`/calendar?month=${month}&body=commandery`,
	`/bodies/eastern-star/calendar?month=${month}`,
	"/pages/about",
	"/pages/scholarships",
	"/pages/contact",
	"/newsletters",
	"/no-such-page",
] as const;
