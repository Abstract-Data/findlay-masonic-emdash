import { data } from "../body-access";
import { BODIES, CONTENT, ensurePage, expect, paragraph, publish, test, unique } from "./site";

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
	// The newsletter project, which runs first, approved an issue, so the archive links to one.
	await page.goto("/newsletters");
	const issue = await page
		.getByTestId("newsletter-archive")
		.locator('a[href^="/newsletters/"]')
		.first()
		.getAttribute("href");
	expect(issue, "an archived newsletter issue").toBeTruthy();
	const routes = [
		...ROUTES,
		`/newsletters/${issue?.split("/").at(-1)}`,
		`/bodies/council/news/${news.slug}`,
	];

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

test("the sitemap lists news at its body's page, and none of an unpublished body (N3, N4)", async ({
	admin,
	ids,
	request,
}) => {
	const listed = await publish(
		admin,
		"news",
		{
			body: ids.council,
			title: "E2E-sitemap Lecture night",
			content: paragraph("A lecture on the Royal Arch."),
			publish_date: new Date().toISOString(),
		},
		unique("e2e-sitemap"),
	);
	// A body that was never published, with a published news item of its own.
	const retired = await data<{ item: { id: string } }>(
		admin.post(`${CONTENT}/bodies`, {
			data: {
				data: { name: "E2E Retired Body", body_type: "Council" },
				slug: unique("e2e-retired"),
			},
		}),
	);
	const hidden = await publish(
		admin,
		"news",
		{
			body: retired.item.id,
			title: "E2E-sitemap Hidden",
			content: paragraph("Not on the site."),
			publish_date: new Date().toISOString(),
		},
		unique("e2e-hidden"),
	);
	try {
		const index = await request.get("/sitemap.xml");
		expect(index.status()).toBe(200);
		expect(await index.text()).toContain("/sitemap-news.xml</loc>");
		const news = await request.get("/sitemap-news.xml");
		expect(news.status()).toBe(200);
		const xml = await news.text();
		expect(xml).toContain(`/bodies/council/news/${listed.slug}</loc>`);
		expect(xml).not.toContain(hidden.slug);
		expect([...xml.matchAll(/<loc>[^<]*<\/loc>/g)].every(([loc]) => loc.includes("/bodies/"))).toBe(
			true,
		);
		const robots = await request.get("/robots.txt");
		expect(robots.status()).toBe(200);
		expect(await robots.text()).toMatch(/^Sitemap: \S+\/sitemap\.xml$/m);
	} finally {
		await data(admin.delete(`${CONTENT}/news/${hidden.id}`));
		await data(admin.delete(`${CONTENT}/bodies/${retired.item.id}`));
	}
});

test("a news slug with a percent sign is reachable from the sitemap and its list (M7 review L8)", async ({
	admin,
	ids,
	page,
	request,
}) => {
	const title = "E2E-percent Ten percent off";
	const item = await publish(
		admin,
		"news",
		{
			body: ids.council,
			title,
			content: paragraph("Dues are ten percent off."),
			publish_date: new Date().toISOString(),
		},
		`${unique("e2e-pct")}%zz`,
	);
	try {
		expect(item.slug).toContain("%zz");
		const xml = await (await request.get("/sitemap-news.xml")).text();
		const loc = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)]
			.map(([, url]) => url ?? "")
			.find((url) => url.includes(encodeURIComponent(item.slug)));
		expect(loc).toBeDefined();
		const fromSitemap = await request.get(new URL(loc ?? "").pathname);
		expect(fromSitemap.status()).toBe(200);
		expect(await fromSitemap.text()).toContain(title);
		await page.goto("/bodies/council/news");
		await page.getByRole("link", { name: title }).first().click();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
	} finally {
		await data(admin.delete(`${CONTENT}/news/${item.id}`));
	}
});
