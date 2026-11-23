import { expect, test } from "@playwright/test";

// Runs in its own project before the newsletter suite approves an issue (playwright.config.ts).
test("FR-6.8: the archive says so when no newsletter has been sent", async ({ page }) => {
	test.setTimeout(120_000);
	const response = await page.goto("/newsletters");
	expect(response?.status()).toBe(200);
	const sentBefore = await page.getByTestId("newsletter-archive").count();
	test.skip(sentBefore > 0, "this database already holds a sent issue from an earlier run");
	await expect(page.getByTestId("newsletter-archive-empty")).toHaveText(
		"No newsletters have been sent yet. Sign up below to get the first issue by email.",
	);
	await expect(page.getByTestId("signup")).toBeVisible();
	expect((await page.goto("/newsletters/no-such-issue"))?.status()).toBe(404);
});
