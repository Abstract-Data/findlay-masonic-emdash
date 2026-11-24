import { AxeBuilder } from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import {
	addDays,
	CONTENT,
	expect,
	findlayTime,
	findlayToday,
	paragraph,
	publish,
	test,
	updateBody,
	type BodySlug,
} from "../public/site";

// Direction C as built, for comparing with docs/design/direction-c/C-*.png by eye: home, a body
// page and the Temple calendar at 1280 and 390 px, light and dark. It seeds a week like the
// mockup's, so it runs after every other project. Set VISUAL_OUT to keep the screenshots
// (docs/design/direction-c/built); otherwise they go to the test's output folder.
test.describe.configure({ mode: "serial" });

const today = findlayToday();
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const day = (offset: number) => addDays(sunday, offset);
const SAMPLE = `visual-${sunday}`;
const year = Number(today.slice(0, 4));

interface Sample {
	readonly body: BodySlug;
	readonly slug: string;
	readonly fields: Record<string, unknown>;
}

const event = (
	body: BodySlug,
	slug: string,
	title: string,
	date: string,
	from: string,
	to: string,
	extra: Record<string, unknown> = {},
): Sample => ({
	body,
	slug: `${SAMPLE}-${slug}`,
	fields: {
		title,
		start: findlayTime(date, from),
		end: findlayTime(date, to),
		location: "Findlay Masonic Temple",
		...extra,
	},
});

const stated = (body: BodySlug, title: string, first: string, time: string, byDay: string) => ({
	...event(body, "", title, first, time, "21:30", {
		rrule: `FREQ=MONTHLY;BYDAY=${byDay}`,
		is_stated_meeting: true,
		location: "Lodge room",
	}),
	slug: `visual-${body}-stated`,
});

const EVENTS: readonly Sample[] = [
	stated("blue-lodge", "Stated meeting", "2026-01-13", "19:30", "2TU"),
	stated("chapter", "Stated convocation", "2026-01-01", "19:30", "1TH"),
	stated("council", "Stated assembly", "2026-01-15", "19:30", "3TH"),
	stated("eastern-star", "Stated meeting", "2026-01-05", "19:00", "1MO,3MO"),
	event("blue-lodge", "rehearsal", "Fellowcraft degree rehearsal", day(2), "19:00", "21:00"),
	event("chapter", "practice", "Royal Arch degree practice", day(3), "19:00", "21:00"),
	{
		body: "temple-board",
		slug: `${SAMPLE}-closed`,
		fields: {
			title: "Temple closed for floor refinishing",
			start: findlayTime(day(4), "00:00"),
			end: findlayTime(day(5), "00:00"),
			all_day: true,
		},
	},
	event("eastern-star", "bake-sale", "Holiday bake sale", day(6), "09:00", "13:00"),
];

const notice = (body: BodySlug, slug: string, title: string, minutesAgo: number): Sample => ({
	body,
	slug: `${SAMPLE}-${slug}`,
	fields: {
		title,
		content: paragraph(
			"Members and families are welcome. Dinner is served in the dining room beforehand.",
		),
		publish_date: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
	},
});

const NEWS: readonly Sample[] = [
	notice("blue-lodge", "election", "Election of officers at the next stated meeting", 3),
	notice("eastern-star", "bake-sale", "Holiday bake sale this Saturday", 2),
	notice("temple-board", "closed", "Building closed Thursday for floor refinishing", 1),
];

const OFFICERS = [
	["Worshipful Master", "Drew DeVore"],
	["Senior Warden", "Mark Ellison"],
	["Junior Warden", "Tom Hartman"],
	["Treasurer", "Gary Wolfe"],
	["Secretary", "Dennis Kramer"],
	["Chaplain", "Paul Ames"],
] as const;

/** Publishes each sample once per week, found again by its slug on a rerun. */
async function ensure(
	admin: APIRequestContext,
	ids: Readonly<Record<BodySlug, string>>,
	collection: string,
	samples: readonly Sample[],
) {
	for (const sample of samples) {
		// oxlint-disable-next-line no-await-in-loop -- one entry at a time keeps the slugs stable.
		const existing = await admin.get(`${CONTENT}/${collection}/${sample.slug}`);
		if (existing.ok()) continue;
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await publish(admin, collection, { body: ids[sample.body], ...sample.fields }, sample.slug);
	}
}

async function shoot(page: Page, name: string, path: string) {
	const out = process.env.VISUAL_OUT;
	for (const [width, height] of [
		[1280, 900],
		[390, 844],
	] as const) {
		for (const scheme of ["light", "dark"] as const) {
			// oxlint-disable-next-line no-await-in-loop -- one viewport and scheme at a time.
			await page.setViewportSize({ width, height });
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await page.emulateMedia({ colorScheme: scheme });
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await page.goto(path);
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await page.evaluate(async () => document.fonts.ready);
			// oxlint-disable-next-line no-await-in-loop -- see above.
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
			);
			expect(overflow, `${path} at ${width}px scrolls sideways`).toBe(0);
			const file = `${name}-${width}${scheme === "dark" ? "-dark" : ""}.png`;
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await page.screenshot({
				path: out === undefined ? test.info().outputPath(file) : `${out}/${file}`,
				fullPage: true,
			});
		}
	}
}

test("seed a week like the mockup's", async ({ admin, ids }) => {
	await ensure(admin, ids, "events", EVENTS);
	await ensure(admin, ids, "news", NEWS);
	await ensure(
		admin,
		ids,
		"officers",
		OFFICERS.map(([title, name], i) => ({
			body: "blue-lodge" as const,
			slug: `visual-officer-${i}`,
			fields: { title, name, term_year: year, display_order: i + 1 },
		})),
	);
	await updateBody(admin, ids["blue-lodge"], {
		schedule_note: "Dinner is served at 6:30 PM before each stated meeting.",
		description: paragraph(
			"Findlay Lodge No. 227 is the Blue Lodge of the Findlay Masonic Temple. Here a man receives the three degrees of Entered Apprentice, Fellowcraft and Master Mason.",
		),
	});
});

test("a busy week on the home page is AA in both schemes", async ({ page }) => {
	await page.goto("/");
	await expect(page.getByTestId("week")).toContainText("Holiday bake sale");
	for (const scheme of ["light", "dark"] as const) {
		// oxlint-disable-next-line no-await-in-loop -- one scheme at a time.
		await page.emulateMedia({ colorScheme: scheme });
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await page.evaluate(async () =>
			Promise.all(document.getAnimations().map(async (a) => a.finished.catch(() => null))),
		);
		// oxlint-disable-next-line no-await-in-loop -- see above.
		const results = await new AxeBuilder({ page })
			.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
			.analyze();
		console.log(`axe / busy week (${scheme}): ${results.violations.length} violations`);
		expect(results.violations.map((v) => v.id)).toEqual([]);
	}
});

test("screenshots: home, a body page and the Temple calendar", async ({ page }) => {
	test.setTimeout(180_000);
	await shoot(page, "home", "/");
	await shoot(page, "body", "/bodies/blue-lodge");
	await shoot(page, "calendar", `/calendar?month=${day(3).slice(0, 7)}`);
});
