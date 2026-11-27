import { expect, test } from "@playwright/test";

test("home returns 200 and has an h1", { tag: "@smoke" }, async ({ page }) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	await expect(page.locator("h1")).toHaveCount(1);
});
