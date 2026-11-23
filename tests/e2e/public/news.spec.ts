import type { Page } from "@playwright/test";
import { data } from "../body-access";
import { discardOpenDrafts, NEWSLETTER_API } from "../newsletter";
import { clearRun, expect, paragraph, publish, test, unique, updateBody } from "./site";

// The Eastern Star's news (its entry carries the tag vocabulary) and one Temple Board item.
// Later tests read the first test's news, so they run in order.
test.describe.configure({ mode: "serial" });

const RUN = "E2E-news";
const TAG = { slug: "e2e-ritual", label: "Ritual work" };

const titles = async (page: Page) =>
	page.getByTestId("news-list").getByRole("heading").allTextContents();

test("FR-3.3: a body's news is newest first, ten to a page, filtered by tag", async ({
	page,
	admin,
	ids,
}) => {
	const body = ids["eastern-star"];
	await updateBody(admin, body, { tag_vocabulary: [TAG] });
	await clearRun(admin, "news", body, RUN);
	await Promise.all(
		Array.from({ length: 12 }, (_, n) => n + 1).map(async (i) =>
			publish(
				admin,
				"news",
				{
					body,
					title: `${RUN} item ${i}`,
					content: paragraph(`Item ${i}.`),
					publish_date: new Date(Date.now() - (20 - i) * 60_000).toISOString(),
					tags: i % 3 === 0 ? [{ tag: TAG.slug }] : [],
				},
				unique("e2e-news"),
			),
		),
	);
	const item = (i: number) => `${RUN} item ${i}`;

	expect((await page.goto("/bodies/eastern-star/news"))?.status()).toBe(200);
	expect(await titles(page)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map(item));
	await page.getByTestId("pager").getByRole("link", { name: "Older news" }).click();
	await expect(page).toHaveURL(/\/bodies\/eastern-star\/news\?page=2$/);
	expect(await titles(page)).toEqual([2, 1].map(item));
	await expect(page.getByTestId("pager").getByRole("link", { name: "Older news" })).toHaveCount(0);

	await page.getByTestId("tag-filter").getByRole("link", { name: TAG.label }).click();
	await expect(page).toHaveURL(/\?tag=e2e-ritual$/);
	expect(await titles(page)).toEqual([12, 9, 6, 3].map(item));
	await expect(page.getByTestId("pager")).toHaveCount(0);

	expect((await page.goto("/bodies/eastern-star/news?page=9"))?.status()).toBe(404);
});

test("FR-3.4: combined news labels each item with its body and filters by body", async ({
	page,
	admin,
	ids,
}) => {
	await clearRun(admin, "news", ids["temple-board"], RUN);
	await publish(
		admin,
		"news",
		{
			body: ids["temple-board"],
			title: `${RUN} Temple roof repaired`,
			content: paragraph("The roof is fixed."),
			publish_date: new Date().toISOString(),
		},
		unique("e2e-news"),
	);

	await page.goto("/news");
	const list = page.getByTestId("news-list");
	const board = list.locator('li[data-body="temple-board"]', {
		hasText: `${RUN} Temple roof repaired`,
	});
	await expect(board).toContainText("Temple Board");
	const star = list.locator('li[data-body="eastern-star"]', { hasText: `${RUN} item 12` });
	await expect(star).toContainText("Eastern Star 23");

	await page.getByTestId("body-filter").getByRole("link", { name: "Temple Board" }).click();
	await expect(page).toHaveURL(/\/news\?body=temple-board$/);
	await expect(list.getByRole("listitem").first()).toContainText(`${RUN} Temple roof repaired`);
	const bodies = await list
		.locator(":scope > li")
		.evaluateAll((items) => items.map((li) => li.getAttribute("data-body")));
	expect(new Set(bodies)).toEqual(new Set(["temple-board"]));
});

test("R8: a news item has its own page, which /news/<slug> and newsletter cards link to", async ({
	page,
	admin,
	ids,
}) => {
	const slug = unique("e2e-news-detail");
	await publish(
		admin,
		"news",
		{
			body: ids["eastern-star"],
			title: `${RUN} Installation of officers`,
			content: paragraph("Officers were installed on Saturday."),
			publish_date: new Date().toISOString(),
			tags: [{ tag: TAG.slug }],
			include_in_newsletter: true,
		},
		slug,
	);
	const path = `/bodies/eastern-star/news/${slug}`;

	expect((await page.goto(path))?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		`${RUN} Installation of officers`,
	);
	await expect(page.locator("main")).toContainText("Officers were installed on Saturday.");
	await expect(page.getByRole("link", { name: TAG.label })).toHaveAttribute(
		"href",
		"/bodies/eastern-star/news?tag=e2e-ritual",
	);
	expect((await page.goto(`/bodies/temple-board/news/${slug}`))?.status()).toBe(404);

	const redirect = await page.request.get(`/news/${slug}`, { maxRedirects: 0 });
	expect(redirect.status()).toBe(302);
	expect(new URL(redirect.headers().location ?? "", page.url()).pathname).toBe(path);

	// The newsletter assembles its article cards from the same news (FR-6.1).
	await discardOpenDrafts(admin);
	const issue = await data<{ id: string; doc: unknown }>(
		admin.post(`${NEWSLETTER_API}/issues/new`),
	);
	try {
		const hrefs = JSON.stringify(issue.doc).match(/"href":"[^"]+"/g) ?? [];
		expect(hrefs.map((href) => new URL(href.slice(8, -1)).pathname)).toContain(path);
	} finally {
		await data(admin.post(`${NEWSLETTER_API}/issues/discard`, { data: { id: issue.id } }));
	}
});
