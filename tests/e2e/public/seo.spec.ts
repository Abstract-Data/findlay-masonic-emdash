import { BODIES, ensurePage, expect, paragraph, publish, test, unique } from "./site";

// WCAG 2.4.2 (page titled) and the SEO budget: every public route has its own non-empty title
// and a meta description, as a visitor sees them, with no SEO panel filled in.
const ROUTES = [
	"/",
	"/bodies",
	...Object.keys(BODIES).map((slug) => `/bodies/${slug}`),
	"/bodies/eastern-star/news",
	"/news",
	"/calendar",
	"/bodies/eastern-star/calendar",
	"/pages/about",
	"/pages/scholarships",
	"/pages/contact",
	"/newsletters",
];

test("every public route has a unique, non-empty title and a meta description", async ({
	page,
	admin,
	ids,
}) => {
	test.setTimeout(120_000);
	await ensurePage(admin, "about", "About", "About the Findlay Masonic Temple.");
	await ensurePage(admin, "scholarships", "Scholarships", "Scholarships for students.");
	await ensurePage(admin, "contact", "Contact", "Write to a body.");
	const news = await publish(
		admin,
		"news",
		{
			body: ids.council,
			title: "E2E-seo Spring banquet",
			content: paragraph("The Council's spring banquet is on the third Saturday of April."),
			publish_date: new Date().toISOString(),
		},
		unique("e2e-seo"),
	);
	const routes = [...ROUTES, `/bodies/council/news/${news.slug}`];

	const heads = [];
	for (const route of routes) {
		// oxlint-disable-next-line no-await-in-loop -- one page at a time.
		expect((await page.goto(route))?.status(), route).toBe(200);
		heads.push({
			route,
			// oxlint-disable-next-line no-await-in-loop -- see above.
			title: (await page.title()).trim(),
			// oxlint-disable-next-line no-await-in-loop -- see above.
			description: await page.evaluate(
				() => document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
			),
		});
	}
	const problems = heads.flatMap(({ route, title, description }) => [
		...(/^[^\s—|].* — Findlay Masonic Temple$|^Findlay Masonic Temple$/.test(title)
			? []
			: [`${route}: title "${title}"`]),
		...(description?.trim() ? [] : [`${route}: no meta description`]),
	]);
	const byTitle = Map.groupBy(heads, (head) => head.title);
	const shared = [...byTitle].filter(([, group]) => group.length > 1);
	expect([
		...problems,
		...shared.map(([title, group]) => `"${title}" on ${group.map((h) => h.route).join(", ")}`),
	]).toEqual([]);
	expect(heads.find((h) => h.route === "/bodies/council")?.title).toContain(BODIES.council);
	expect(heads.at(-1)?.description).toContain("spring banquet");
});
