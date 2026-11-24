import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { storageStatePath } from "../roles";
import { addDays, addMonths, findlayToday } from "../public/site";

// NFR accessibility (constitution amendment 1): WCAG 2.1 AA, zero axe violations, on every public
// route and the two plugin admin pages. Runs after the public suites, so lists hold content.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SCHEMES = ["light", "dark"] as const;
const today = findlayToday();
const month = addMonths(today, 2);
// Two weeks on, the Temple Board has nothing: the home page's quiet-week notice.
const quietWeek = addDays(today, 14 - new Date(`${today}T12:00:00Z`).getUTCDay());

const PUBLIC_ROUTES = [
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
];

async function violations(page: Page, scope?: string, exclude?: string) {
	const builder = new AxeBuilder({ page }).withTags(TAGS);
	if (scope !== undefined) builder.include(scope);
	if (exclude !== undefined) builder.exclude(exclude);
	const results = await builder.analyze();
	return results.violations.map((v) => ({
		rule: v.id,
		impact: v.impact,
		targets: v.nodes.map((node) => node.target.join(" ")),
	}));
}

/**
 * Light then dark, checking that the dark pass really renders the dark palette. The layout
 * animates colours for 150 ms when the scheme changes, and halfway through, a link's text and
 * background are both mid-grey, so axe scans only once every transition has finished.
 */
async function inBothSchemes(page: Page, label: string, exclude?: string): Promise<void> {
	const backgrounds = new Set<string>();
	for (const scheme of SCHEMES) {
		// oxlint-disable-next-line no-await-in-loop -- one colour scheme at a time.
		await page.emulateMedia({ colorScheme: scheme });
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await page.evaluate(async () =>
			Promise.all(document.getAnimations().map(async (a) => a.finished.catch(() => null))),
		);
		// oxlint-disable-next-line no-await-in-loop -- see above.
		backgrounds.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
		// oxlint-disable-next-line no-await-in-loop -- see above.
		const found = await violations(page, undefined, exclude);
		console.log(`axe ${label} (${scheme}): ${found.length} violations`);
		expect(found, `${label} in ${scheme} mode`).toEqual([]);
	}
	expect(backgrounds.size, "light and dark render different backgrounds").toBe(SCHEMES.length);
}

test.describe("public routes, as a visitor", () => {
	test.use({ storageState: storageStatePath("anon") });

	for (const route of PUBLIC_ROUTES) {
		test(`axe AA: ${route}`, async ({ page }) => {
			await page.goto(route);
			await inBothSchemes(page, route);
		});
	}

	test("axe AA: a news item's own page", async ({ page }) => {
		await page.goto("/bodies/eastern-star/news");
		const first = page.getByTestId("news-list").getByRole("heading").getByRole("link").first();
		await page.goto((await first.getAttribute("href")) ?? "/");
		await inBothSchemes(page, new URL(page.url()).pathname);
	});

	// The email sits in a sandboxed frame that runs no script, so axe cannot enter it there; the
	// page is scanned around it, and the emailed HTML on its own.
	test("axe AA: a newsletter issue's own page, and the email it shows", async ({ page }) => {
		await page.goto("/newsletters");
		const first = page.getByTestId("newsletter-archive").getByRole("link").first();
		await page.goto((await first.getAttribute("href")) ?? "/");
		const frame = '[data-testid="newsletter-email"]';
		const html = await page.locator(frame).getAttribute("srcdoc");
		await inBothSchemes(page, new URL(page.url()).pathname, frame);

		await page.emulateMedia({ colorScheme: "light" });
		await page.setContent(html ?? "");
		const found = await violations(page);
		console.log(`axe the emailed issue: ${found.length} violations`);
		expect(found).toEqual([]);
	});
});

// The scan covers each plugin's own page. EmDash's admin shell around it is EmDash's markup; on
// 2026-11-23 its one finding was label-content-name-mismatch on a shell control (base-ui), the
// same on every admin page.

test.describe("plugin admin pages, as an Admin", () => {
	test.use({ storageState: storageStatePath("admin") });

	for (const [label, testId] of [
		["Body Access", "body-access"],
		["Newsletter", "newsletter"],
	] as const) {
		test(`axe AA: ${label} admin page`, async ({ page }) => {
			test.setTimeout(240_000);
			await page.goto("/_emdash/admin");
			await page
				.getByRole("complementary", { name: "Admin navigation" })
				.getByRole("link", { name: label })
				.click({ timeout: 150_000 });
			await expect(page.getByTestId(testId)).toBeVisible({ timeout: 60_000 });
			const found = await violations(page, `[data-testid="${testId}"]`);
			console.log(`axe ${label} admin page: ${found.length} violations`);
			expect(found).toEqual([]);
		});
	}
});
