import { expect, test } from "@playwright/test";

const COLLECTIONS = ["Bodies", "Officers", "Events", "News", "Pages"];
const BODIES = [
	"Findlay Lodge",
	"Findlay Chapter",
	"Findlay Council",
	"Findlay Commandery",
	"Findlay Chapter, Order of the Eastern Star",
	"Findlay Temple Board",
];

// EmDash's dev-only bypass signs in a dev admin and applies the seed with its
// content. M3 replaces it with real per-role sign-in (tests/e2e/auth.setup.ts).
test("admin lists the collections and the six bodies", { tag: "@smoke" }, async ({ page }) => {
	// The admin SPA bundles its dependencies on the first dev-server visit.
	test.setTimeout(180_000);
	await page.goto("/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin");
	await page.waitForURL("**/_emdash/admin**");

	const nav = page.getByRole("complementary", { name: "Admin navigation" });
	const welcome = page.getByRole("button", { name: "Get Started" });
	await expect(welcome.or(nav)).toBeVisible({ timeout: 150_000 });
	if (await welcome.isVisible()) await welcome.click();

	await Promise.all(
		COLLECTIONS.map((label) =>
			expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible(),
		),
	);
	await expect(nav.getByRole("link", { name: "Posts", exact: true })).toHaveCount(0);

	await page.goto("/_emdash/admin/content/bodies");
	await Promise.all(
		BODIES.map((name) => expect(page.getByRole("link", { name, exact: true })).toBeVisible()),
	);
});
