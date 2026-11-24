import { expect, test } from "@playwright/test";

// Runs after the newsletter suite has approved an issue (playwright.config.ts).
test.use({ storageState: { cookies: [], origins: [] } });

// The six body colours' light values, as the email theme writes them.
const BODY_BARS = new Set([
	"rgb(29, 78, 216)",
	"rgb(185, 28, 28)",
	"rgb(109, 40, 217)",
	"rgb(51, 65, 85)",
	"rgb(4, 120, 87)",
	"rgb(146, 64, 14)",
]);

test("FR-6.8: an anonymous visitor sees the sent issues and can open one", async ({
	page,
	playwright,
	baseURL,
}) => {
	test.setTimeout(120_000);
	const response = await page.goto("/newsletters");
	expect(response?.status()).toBe(200);
	const archive = page.getByTestId("newsletter-archive");
	await expect(archive).toBeVisible();
	await expect(page.getByTestId("newsletter-archive-empty")).toHaveCount(0);
	const first = archive.getByRole("link").first();
	const subject = await first.textContent();
	const href = await first.getAttribute("href");
	expect(href).toMatch(/^\/newsletters\/[^/]+$/);

	const visitor = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
	const issue = await visitor.get(href ?? "");
	expect(issue.status()).toBe(200);
	const html = await issue.text();
	expect(html).toContain('data-testid="newsletter-email"');
	expect(html).toContain("Get the next issue by email");
	expect(html).not.toContain("RESEND_UNSUBSCRIBE_URL");
	await visitor.dispose();

	await first.click();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(subject ?? "");
	const email = page.frameLocator('[data-testid="newsletter-email"]');
	await expect(email.locator("body")).toContainText("Get the next issue by email");

	// Direction C in email: each body's section is ruled in its colour (src/plugins/newsletter/theme.ts).
	const bars = await email.locator("td").evaluateAll((cells) =>
		cells.flatMap((cell) => {
			const style = getComputedStyle(cell);
			return style.borderTopWidth === "4px" ? [style.borderTopColor] : [];
		}),
	);
	expect(bars.length).toBeGreaterThan(0);
	expect(bars.filter((bar) => !BODY_BARS.has(bar))).toEqual([]);
});
