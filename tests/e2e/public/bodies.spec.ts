import {
	addDays,
	BODIES,
	clearRun,
	expect,
	findlayTime,
	findlayToday,
	image,
	paragraph,
	publish,
	test,
	unique,
	updateBody,
} from "./site";

// Commandery and Temple Board pages, and the Eastern Star's officers. The tests share those
// bodies' entries, so they run in order.
test.describe.configure({ mode: "serial" });

const RUN = "E2E-bodies";

test("FR-1.1, FR-1.3: a body's page shows its schedule, next meetings, news and next 60 days", async ({
	page,
	admin,
	ids,
}) => {
	const body = ids.commandery;
	await clearRun(admin, "events", body, RUN);
	await clearRun(admin, "news", body, RUN);
	const note = `Dark in July and August (${unique("note")})`;
	await updateBody(admin, body, { schedule_note: note });
	await publish(admin, "events", {
		body,
		title: `${RUN} Stated Conclave`,
		start: findlayTime("2026-01-15", "10:00"),
		end: findlayTime("2026-01-15", "12:00"),
		rrule: "FREQ=MONTHLY;BYMONTHDAY=15",
		is_stated_meeting: true,
		location: "Findlay Masonic Temple",
	});
	const today = findlayToday();
	const soon = addDays(today, 10);
	const later = addDays(today, 90);
	await publish(admin, "events", {
		body,
		title: `${RUN} Ladies night`,
		start: findlayTime(soon, "18:00"),
		end: findlayTime(soon, "21:00"),
	});
	await publish(admin, "events", {
		body,
		title: `${RUN} Spring inspection`,
		start: findlayTime(later, "18:00"),
		end: findlayTime(later, "21:00"),
	});
	const news = await Promise.all(
		[1, 2, 3, 4, 5, 6].map(async (i) =>
			publish(
				admin,
				"news",
				{
					body,
					title: `${RUN} Commandery news ${i}`,
					content: paragraph(`Sir Knights met for the ${i} time.`),
					publish_date: new Date(Date.now() - (10 - i) * 60_000).toISOString(),
				},
				unique("e2e-bodies-news"),
			),
		),
	);

	expect((await page.goto("/bodies/commandery"))?.status()).toBe(200);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(BODIES.commandery);

	const schedule = page.getByTestId("schedule");
	await expect(schedule).toContainText("15th of each month, 10:00 AM");
	await expect(schedule).toContainText(note);
	const next = page.getByTestId("next-meetings").locator("time");
	await expect(next).toHaveCount(3);
	for (const text of await next.allTextContents()) {
		expect(text).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} 15, 10:00 AM$/);
	}
	const starts = await next.evaluateAll((times) =>
		times.map((t) => t.getAttribute("datetime") ?? ""),
	);
	expect(new Set(starts).size).toBe(3);
	expect(starts).toEqual(starts.toSorted((a, b) => a.localeCompare(b)));

	const upcoming = page.getByTestId("agenda");
	await expect(upcoming).toContainText(`${RUN} Ladies night`);
	await expect(upcoming).not.toContainText(`${RUN} Spring inspection`);

	const latest = page.getByTestId("news-list").getByRole("listitem");
	await expect(latest).toHaveCount(5);
	await expect(latest.first()).toContainText(`${RUN} Commandery news 6`);
	await expect(page.getByTestId("news-list")).not.toContainText(`${RUN} Commandery news 1`);
	await expect(page.getByRole("link", { name: `${RUN} Commandery news 6` })).toHaveAttribute(
		"href",
		`/bodies/commandery/news/${news[5]?.slug}`,
	);
});

test("FR-1.2: the bodies index lists every body with its emblem and next meeting", async ({
	page,
	admin,
	ids,
}) => {
	await updateBody(admin, ids.commandery, { emblem: await image(admin, "Commandery emblem") });

	expect((await page.goto("/bodies"))?.status()).toBe(200);
	const cards = page.getByTestId("body-card");
	await expect(cards).toHaveCount(Object.keys(BODIES).length);
	for (const [slug, name] of Object.entries(BODIES)) {
		const card = page.locator(`[data-testid="body-card"][data-body="${slug}"]`);
		// oxlint-disable-next-line no-await-in-loop -- one card at a time reads clearly in a failure.
		await expect(card.getByRole("link", { name, exact: true })).toHaveAttribute(
			"href",
			`/bodies/${slug}`,
		);
	}
	const commandery = page.locator('[data-testid="body-card"][data-body="commandery"]');
	await expect(commandery.locator("img")).toHaveCount(1);
	await expect(commandery).toContainText(/Next meeting: [A-Z][a-z]{2}, [A-Z][a-z]{2} 15, 10:00 AM/);
	await expect(page.locator('[data-testid="body-card"][data-body="temple-board"]')).toContainText(
		"Contact the secretary for meeting times.",
	);
});

test("FR-1.4: a body with no stated meeting shows its note, else the secretary message", async ({
	page,
	admin,
	ids,
}) => {
	const body = ids["temple-board"];
	await updateBody(admin, body, { schedule_note: "" });
	try {
		await page.goto("/bodies/temple-board");
		const schedule = page.getByTestId("schedule");
		await expect(schedule).toContainText("Contact the secretary for meeting times.");
		await expect(page.getByTestId("next-meetings")).toHaveCount(0);

		const note = "Meets at the call of the President";
		await updateBody(admin, body, { schedule_note: note });
		await page.reload();
		await expect(schedule).toHaveText(note);
	} finally {
		await updateBody(admin, body, { schedule_note: "" });
	}
});

test("FR-2.2: a body page shows only the current term's officers, in display order", async ({
	page,
	admin,
	ids,
}) => {
	const body = ids["eastern-star"];
	await clearRun(admin, "officers", body, RUN, "name");
	const year = Number(findlayToday().slice(0, 4));
	const officer = async (title: string, name: string, term: number, order: number) =>
		publish(admin, "officers", {
			body,
			title,
			name: `${RUN} ${name}`,
			term_year: term,
			display_order: order,
		});
	await officer("Worthy Matron", "Past Matron", year - 1, 1);
	await officer("Worthy Patron", "Current Patron", year, 2);
	await officer("Worthy Matron", "Current Matron", year, 1);
	await officer("Worthy Matron", "Elected Matron", year + 1, 1);

	await page.goto("/bodies/eastern-star");
	await expect(page.getByRole("heading", { name: `Officers for ${year}` })).toBeVisible();
	const officers = page.getByTestId("officers");
	expect(await officers.locator("dt").allTextContents()).toEqual([
		"Worthy Matron",
		"Worthy Patron",
	]);
	expect(await officers.locator(".officers__name").allTextContents()).toEqual([
		`${RUN} Current Matron`,
		`${RUN} Current Patron`,
	]);
});
