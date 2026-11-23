import type { APIRequestContext, Page } from "@playwright/test";
import {
	addMonths,
	clearRun,
	expect,
	findlayTime,
	findlayToday,
	publish,
	test,
	weekdaysIn,
	type BodySlug,
} from "./site";

// Eastern Star and Commandery events two months ahead, clear of today's date. The first test
// seeds them and the rest read them, so they run in order.
test.describe.configure({ mode: "serial" });

const RUN = "E2E-calendar";
const WEDNESDAY = 3;
const month = addMonths(findlayToday(), 2);
const wednesdays = weekdaysIn(month, WEDNESDAY);
const [first = "", skipped = ""] = wednesdays;
const kept = wednesdays.filter((day) => day !== skipped);
const inspectionDay = `${month}-10`;

async function seed(admin: APIRequestContext, ids: Readonly<Record<BodySlug, string>>) {
	await clearRun(admin, "events", ids["eastern-star"], RUN);
	await clearRun(admin, "events", ids.commandery, RUN);
	await publish(admin, "events", {
		body: ids["eastern-star"],
		title: `${RUN} Ritual practice`,
		start: findlayTime(first, "19:00"),
		end: findlayTime(first, "21:00"),
		rrule: "FREQ=WEEKLY;BYDAY=WE",
		exdates: [skipped],
		location: "Lodge room",
	});
	await publish(admin, "events", {
		body: ids.commandery,
		title: `${RUN} Inspection`,
		start: findlayTime(inspectionDay, "18:30"),
		end: findlayTime(inspectionDay, "20:30"),
	});
}

const daysWith = async (page: Page, title: string) =>
	page
		.getByTestId("month-grid")
		.locator("td[data-date]", { hasText: title })
		.evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-date")));

test("FR-4.3: a body's month expands its recurring event and leaves out the EXDATE", async ({
	page,
	admin,
	ids,
}) => {
	await seed(admin, ids);
	expect((await page.goto(`/bodies/eastern-star/calendar?month=${month}`))?.status()).toBe(200);
	expect(await daysWith(page, `${RUN} Ritual practice`)).toEqual(kept);
	const agenda = page.getByTestId("agenda");
	const listed = await agenda
		.locator(":scope > li", { hasText: `${RUN} Ritual practice` })
		.locator("h3 time")
		.evaluateAll((times) => times.map((t) => t.getAttribute("datetime")));
	expect(listed).toEqual(kept);
	await expect(agenda).toContainText("7:00 PM");
	await expect(page.getByTestId("month-grid")).not.toContainText(`${RUN} Inspection`);

	await page
		.getByTestId("month-nav")
		.getByRole("link", { name: /^Next:/ })
		.click();
	await expect(page).toHaveURL(new RegExp(`month=${addMonths(`${month}-01`, 1)}$`));
});

test("FR-4.4: the Temple calendar labels each body's entries and filters by body", async ({
	page,
}) => {
	await page.goto(`/calendar?month=${month}`);
	const grid = page.getByTestId("month-grid");
	const inspection = grid.locator('li[data-body="commandery"]', { hasText: `${RUN} Inspection` });
	await expect(inspection).toContainText("Commandery 49");
	await expect(inspection).toContainText("6:30 PM");
	const practice = grid.locator('li[data-body="eastern-star"]', {
		hasText: `${RUN} Ritual practice`,
	});
	await expect(practice).toHaveCount(kept.length);
	await expect(practice.first()).toContainText("Eastern Star 23");
	expect(await daysWith(page, `${RUN} Inspection`)).toEqual([inspectionDay]);

	// The filter is a plain form: untick the Eastern Star and show the rest.
	const filter = page.getByTestId("calendar-filter");
	await filter
		.getByRole("checkbox", { name: "Findlay Chapter, Order of the Eastern Star No. 23" })
		.uncheck();
	await filter.getByRole("button", { name: "Show calendar" }).click();
	await expect(page).toHaveURL(/body=commandery/);
	expect(new URL(page.url()).searchParams.getAll("body")).not.toContain("eastern-star");
	await expect(grid.locator('li[data-body="eastern-star"]')).toHaveCount(0);
	await expect(
		grid.locator('li[data-body="commandery"]', { hasText: `${RUN} Inspection` }),
	).toHaveCount(1);
	await expect(
		filter.getByRole("checkbox", { name: "Findlay Chapter, Order of the Eastern Star No. 23" }),
	).not.toBeChecked();
	await expect(filter.getByRole("checkbox", { name: "Findlay Commandery No. 49" })).toBeChecked();
});

test("FR-4.5: the ICS feeds carry RRULE, EXDATE and TZID America/New_York", async ({ request }) => {
	const body = await request.get("/bodies/eastern-star/calendar.ics");
	expect(body.status()).toBe(200);
	expect(body.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
	const feed = await body.text();
	const exdate = skipped.replaceAll("-", "");
	expect(feed).toMatch(/^BEGIN:VCALENDAR\r\n/);
	expect(feed).toContain("BEGIN:VTIMEZONE\r\nTZID:America/New_York\r\n");
	expect(feed).toContain(`SUMMARY:${RUN} Ritual practice\r\n`);
	expect(feed).toContain(`DTSTART;TZID=America/New_York:${first.replaceAll("-", "")}T190000\r\n`);
	expect(feed).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE\r\n");
	expect(feed).toContain(`EXDATE;TZID=America/New_York:${exdate}T190000\r\n`);
	expect(feed).not.toContain(`SUMMARY:${RUN} Inspection`);

	const combined = await request.get("/calendar.ics");
	expect(combined.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
	const all = await combined.text();
	expect(all).toContain(`SUMMARY:${RUN} Ritual practice\r\n`);
	expect(all).toContain(`SUMMARY:${RUN} Inspection\r\n`);
	expect(all).toContain("X-WR-CALNAME:Findlay Masonic Temple\r\n");
});
