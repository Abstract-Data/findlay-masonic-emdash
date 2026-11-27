import { ensurePage, expect, test } from "./site";

test("FR-9.1: Home, About, Scholarships and Contact render from the pages collection", async ({
	page,
	admin,
}) => {
	await ensurePage(admin, "home", "Home", "Six Masonic bodies meet at the Temple on Main Street.");
	await ensurePage(
		admin,
		"scholarships",
		"Scholarships",
		"The lodge awards scholarships each spring.",
	);
	await ensurePage(admin, "contact", "Contact Us", "Write to any body below.");

	expect((await page.goto("/"))?.status()).toBe(200);
	await expect(page.locator("main")).toContainText(
		"Six Masonic bodies meet at the Temple on Main Street.",
	);
	for (const [path, title] of [
		["/pages/about", "About"],
		["/pages/scholarships", "Scholarships"],
		["/pages/contact", "Contact Us"],
	] as const) {
		// oxlint-disable-next-line no-await-in-loop -- one page at a time.
		expect((await page.goto(path))?.status(), path).toBe(200);
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
	}
	await expect(
		page.getByTestId("contact-form").or(page.getByTestId("contact-unavailable")),
	).toBeVisible();
	expect((await page.goto("/pages/no-such-page"))?.status()).toBe(404);
});

for (const name of ["constructor", "__proto__", "toString"]) {
	test(`a form status of "${name}" shows no message (M7 review L3)`, async ({ page }) => {
		await page.goto(`/newsletters?subscribe=${name}`);
		await expect(page.getByTestId("signup")).toBeVisible();
		await expect(page.getByTestId("signup-message")).toHaveCount(0);
		await page.goto(`/bodies/council?contact=${name}`);
		await expect(page.locator("#contact")).toBeVisible();
		await expect(page.getByTestId("contact-message")).toHaveCount(0);
	});
}

test("a form status that names an outcome shows its message", async ({ page }) => {
	await page.goto("/newsletters?subscribe=rate-limited");
	await expect(page.getByTestId("signup-message")).toHaveText(
		"Too many signups have come in the last hour. Please try again later.",
	);
	await page.goto("/bodies/council?contact=unavailable");
	await expect(page.getByTestId("contact-message")).toHaveText(
		"Messages are not working right now. Please try again later.",
	);
});

test("every main menu link resolves", async ({ page, request }) => {
	await page.goto("/");
	const links = await page
		.getByRole("navigation", { name: "Main" })
		.getByRole("link")
		.evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href") ?? ""));
	expect(links).toEqual(["/", "/bodies", "/calendar", "/news", "/pages/about"]);
	for (const href of links) {
		// oxlint-disable-next-line no-await-in-loop -- one link at a time.
		expect((await request.get(href)).status(), href).toBe(200);
	}
});
