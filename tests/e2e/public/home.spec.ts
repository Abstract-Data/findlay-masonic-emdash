import { addDays, clearRun, expect, findlayTime, findlayToday, publish, test } from "./site";

// Direction C's home page: this week at the Temple. The tests share one seeded week, so they
// run in order.
test.describe.configure({ mode: "serial" });

const RUN = "E2E-home";
const today = findlayToday();
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const inspection = addDays(sunday, 3);
const quietWeek = addDays(sunday, 14);
const later = addDays(sunday, 22);

test("the home page opens on this week, each event labelled by body on its day", async ({
	page,
	admin,
	ids,
}) => {
	await clearRun(admin, "events", ids.commandery, RUN);
	await clearRun(admin, "events", ids["temple-board"], RUN);
	await publish(admin, "events", {
		body: ids.commandery,
		title: `${RUN} Inspection`,
		start: findlayTime(inspection, "18:30"),
		end: findlayTime(inspection, "20:30"),
	});
	await publish(admin, "events", {
		body: ids["temple-board"],
		title: `${RUN} Furnace service`,
		start: findlayTime(later, "09:00"),
		end: findlayTime(later, "12:00"),
	});

	expect((await page.goto("/"))?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("This week at the Temple");
	const week = page.getByTestId("week");
	await expect(week.locator(":scope > li")).toHaveCount(7);
	await expect(week.locator(":scope > li").first()).toHaveAttribute("data-date", sunday);
	await expect(week.locator(`li[data-date="${today}"]`)).toContainText("Today");
	const entry = week
		.locator(`li[data-date="${inspection}"]`)
		.locator('li[data-body="commandery"]', { hasText: `${RUN} Inspection` });
	await expect(entry).toContainText("6:30 PM");
	await expect(entry).toContainText("Commandery 49");
});

test("the body filter is a plain form, and the week links keep it", async ({ page }) => {
	await page.goto("/");
	const filter = page.getByTestId("calendar-filter");
	for (const box of await filter.getByRole("checkbox").all()) {
		// oxlint-disable-next-line no-await-in-loop -- one box at a time.
		await box.uncheck();
	}
	await filter.getByRole("checkbox", { name: "Council 50" }).check();
	await filter.getByRole("button", { name: "Update" }).click();
	await expect(page).toHaveURL(/\/\?body=council$/);
	await expect(page.getByTestId("week").getByText(`${RUN} Inspection`)).toHaveCount(0);
	await expect(
		page.getByTestId("calendar-filter").getByRole("link", { name: "Show all bodies" }),
	).toHaveAttribute("href", "/");

	await page.getByTestId("week-nav").getByRole("link", { name: "Next week" }).click();
	await expect(page).toHaveURL(new RegExp(`week=${addDays(sunday, 7)}&body=council$`));
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Next week at the Temple");
	await page.getByTestId("week-nav").getByRole("link", { name: "This week" }).click();
	await expect(page).toHaveURL(/\/\?body=council$/);
});

test("a quiet week says so and names the next event, with a link to its week", async ({ page }) => {
	await page.goto(`/?week=${quietWeek}&body=temple-board`);
	await expect(page.getByTestId("week")).toHaveCount(0);
	const quiet = page.getByTestId("quiet-week");
	await expect(quiet).toContainText("Nothing this week for the bodies you chose.");
	await expect(quiet).toContainText(`Next: ${RUN} Furnace service`);
	await expect(quiet).toContainText("Temple Board");
	await quiet.getByRole("link", { name: "Show that week" }).click();
	await expect(page).toHaveURL(new RegExp(`week=${addDays(sunday, 21)}&body=temple-board$`));
	await expect(page.getByTestId("week")).toContainText(`${RUN} Furnace service`);
});

test("the joining card writes to Findlay Lodge No. 227, and the signup posts", async ({ page }) => {
	await page.goto("/");
	const joining = page.getByTestId("joining");
	await expect(joining).toContainText("Findlay Lodge No. 227");
	await expect(joining.getByRole("link", { name: "Write to Lodge 227" })).toHaveAttribute(
		"href",
		/^\/bodies\/blue-lodge(#contact)?$/,
	);
	const form = page.getByTestId("signup");
	await expect(form).toHaveAttribute("action", "/_emdash/api/plugins/newsletter/subscribe");
	await expect(form.getByLabel("Email address")).toHaveAttribute("type", "email");
});
