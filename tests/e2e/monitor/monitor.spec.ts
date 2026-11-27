import { expect, test } from "@playwright/test";

// Post-deploy checks (M7): run against a deployed site with
// `ENVIRONMENT_URL=<site> pnpm exec playwright test -c tests/e2e/monitor/deployed.config.ts`,
// and locally with `pnpm e2e --grep @monitor`. They read only what every deployment has, the seeded bodies
// and the routes, and write nothing, so they are safe to run against the live site.
const MONITOR = { tag: "@monitor" } as const;

test("home renders with the site's name", MONITOR, async ({ page }) => {
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
	await expect(page.getByRole("navigation").first()).toBeVisible();
	expect((await page.title()).trim()).not.toBe("");
});

test("a body's page renders its name and schedule", MONITOR, async ({ page }) => {
	const response = await page.goto("/bodies/blue-lodge");
	expect(response?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Lodge");
	await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S/);
});

test("the Temple calendar renders this month", MONITOR, async ({ page }) => {
	const response = await page.goto("/calendar");
	expect(response?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Temple calendar");
	await expect(page.getByTestId("month-grid")).toBeVisible();
});

test("the calendar feed is a valid iCalendar file", MONITOR, async ({ request }) => {
	const response = await request.get("/calendar.ics");
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toContain("text/calendar");
	const ics = await response.text();
	expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
	expect(ics).toContain("\r\nPRODID:");
	expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
});

test("the newsletter signup form renders", MONITOR, async ({ page }) => {
	const response = await page.goto("/newsletters");
	expect(response?.status()).toBe(200);
	const form = page.getByTestId("signup");
	await expect(form.getByLabel("Email address")).toBeVisible();
	await expect(form.getByRole("button", { name: "Subscribe" })).toBeEnabled();
});
