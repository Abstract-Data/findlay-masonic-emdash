import { readFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import type { APIRequestContext, Page } from "@playwright/test";
import { PUBLIC_ROUTES } from "../public/routes";
import {
	addDays,
	BODIES,
	CONTENT,
	expect,
	findlayTime,
	findlayToday,
	image,
	paragraph,
	publish,
	test,
	updateBody,
	type BodySlug,
} from "../public/site";

// The site as built, with the content it will really carry: home, a body page and the Temple
// calendar at 1280 and 390 px, light and dark, for comparing with docs/design/direction-c/C-*.png
// by eye, and every public page checked for sideways scrolling and entries spilling out of their
// day. It seeds a week like the mockup's and, nine weeks on, a crowded one, so it runs after every
// other project. Set VISUAL_OUT to keep the screenshots (docs/design/direction-c/built);
// otherwise they go to the test's output folder.

const today = findlayToday();
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const day = (offset: number) => addDays(sunday, offset);
const SAMPLE = `visual-${sunday}`;
const year = Number(today.slice(0, 4));
// Far enough on to fall in a month of its own, so the mockup's month stays as the mockup drew it.
const crowded = addDays(sunday, 63);
const crowdedDay = addDays(crowded, 3);

const LONG_TITLE = "Annual Thanksgiving dinner for the widows and their families";
const LONG_WORD = "Pneumonoultramicroscopicsilicovolcanoconiosis";

/** WCAG 1.4.10 asks for no sideways scrolling at 320 CSS px; the rest are common screens. */
const WIDTHS = [320, 390, 768, 1024, 1280] as const;
/** The day cards and the month grid change shape one pixel above 1000 and 760. */
const CALENDAR_WIDTHS = [...WIDTHS, 761, 1001] as const;

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

/** Seven entries on one day, every body among them, with a long title and a long word. */
const CROWDED: readonly Sample[] = [
	event("blue-lodge", "crowded-1", LONG_TITLE, crowdedDay, "08:00", "10:00"),
	event("chapter", "crowded-2", "Chapter officers meeting", crowdedDay, "10:30", "11:30"),
	event("council", "crowded-3", `${LONG_WORD} lecture`, crowdedDay, "12:00", "13:00"),
	event("commandery", "crowded-4", "Commandery drill team practice", crowdedDay, "15:00", "16:00"),
	event("eastern-star", "crowded-5", "Worthy Matron's committee", crowdedDay, "17:30", "18:30"),
	event("temple-board", "crowded-6", "Building committee", crowdedDay, "18:00", "19:00"),
	event(
		"blue-lodge",
		"crowded-7",
		"Education night: the working tools",
		crowdedDay,
		"19:00",
		"21:00",
	),
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

// The three newest are the mockup's notices on the home page; the long ones are on /news.
const LONG_NEWS = notice("eastern-star", "long-title", LONG_TITLE, 10);
const NEWS: readonly Sample[] = [
	notice("blue-lodge", "election", "Election of officers at the next stated meeting", 3),
	notice("eastern-star", "bake-sale", "Holiday bake sale this Saturday", 2),
	notice("temple-board", "closed", "Building closed Thursday for floor refinishing", 1),
	LONG_NEWS,
	notice("council", "long-word", `${LONG_WORD} scholarship`, 11),
];

const OFFICERS = [
	["Worshipful Master", "Drew DeVore"],
	["Senior Warden", "Mark Ellison"],
	["Junior Warden", "Tom Hartman"],
	["Treasurer", "Gary Wolfe"],
	["Secretary", "Dennis Kramer"],
	["Chaplain", "Paul Ames"],
] as const;

const crowdedWeekPath = `/?week=${crowded}`;
const MONTH_GRIDS = [
	`/calendar?month=${day(3).slice(0, 7)}`,
	`/calendar?month=${crowdedDay.slice(0, 7)}`,
];

/** Every public page: the shared list, each body's pages, the crowded week and month. */
const ROUTES = [
	...new Set<string>([
		...PUBLIC_ROUTES,
		...Object.keys(BODIES).flatMap((slug) => [
			`/bodies/${slug}`,
			`/bodies/${slug}/calendar?month=${crowdedDay.slice(0, 7)}`,
			`/bodies/${slug}/news`,
		]),
		crowdedWeekPath,
		...MONTH_GRIDS,
		`/bodies/${LONG_NEWS.body}/news/${LONG_NEWS.slug}`,
	]),
];

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

/** The elements that stick out past the right edge of the viewport, innermost first. */
async function sideways(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const root = document.documentElement;
		const over = root.scrollWidth - root.clientWidth;
		if (over <= 0) return [];
		const wide = [...document.body.querySelectorAll<HTMLElement>("*")].filter(
			(el) => el.getBoundingClientRect().right > root.clientWidth + 0.5,
		);
		const innermost = wide.filter((el) => ![...el.children].some((child) => wide.includes(child)));
		return [
			`scrolls sideways by ${over}px`,
			...innermost.slice(0, 4).map((el) => {
				const name = `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
				const text = (el.textContent ?? "").trim().slice(0, 40);
				return `${name} "${text}" ends at ${Math.round(el.getBoundingClientRect().right)}px`;
			}),
		];
	});
}

/** Every calendar entry, and its body's name, that is not inside its day. */
async function spills(page: Page, days: string): Promise<{ entries: number; out: string[] }> {
	return page.evaluate((selector) => {
		// oxlint-disable-next-line unicorn/consistent-function-scoping -- it runs in the page.
		const within = (inner: DOMRect, outer: DOMRect) =>
			inner.left >= outer.left - 0.5 &&
			inner.right <= outer.right + 0.5 &&
			inner.top >= outer.top - 0.5 &&
			inner.bottom <= outer.bottom + 0.5;
		const out: string[] = [];
		let entries = 0;
		for (const cell of document.querySelectorAll<HTMLElement>(selector)) {
			const box = cell.getBoundingClientRect();
			for (const entry of cell.querySelectorAll<HTMLElement>(".entry")) {
				entries += 1;
				const own = entry.getBoundingClientRect();
				const title = (entry.querySelector(".entry__title")?.textContent ?? "").slice(0, 30);
				if (!within(own, box)) {
					out.push(
						`${cell.dataset.date}: "${title}" leaves its day by ${Math.round(own.right - box.right)}px`,
					);
				}
				const label = entry.querySelector(".body-label");
				if (label !== null && !within(label.getBoundingClientRect(), own)) {
					out.push(`${cell.dataset.date}: "${title}" body name leaves its entry`);
				}
			}
		}
		return { entries, out };
	}, days);
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
			const file = `${name}-${width}${scheme === "dark" ? "-dark" : ""}.png`;
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await page.screenshot({
				path: out === undefined ? test.info().outputPath(file) : `${out}/${file}`,
				fullPage: true,
			});
		}
	}
}

test("seed a week like the mockup's, a crowded week and two odd-shaped emblems", async ({
	admin,
	ids,
}) => {
	await ensure(admin, ids, "events", [...EVENTS, ...CROWDED]);
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
		emblem: await image(admin, "", readFileSync(new URL("emblem-tall.png", import.meta.url))),
		schedule_note: "Dinner is served at 6:30 PM before each stated meeting.",
		description: paragraph(
			"Findlay Lodge No. 227 is the Blue Lodge of the Findlay Masonic Temple. Here a man receives the three degrees of Entered Apprentice, Fellowcraft and Master Mason.",
		),
	});
	await updateBody(admin, ids.chapter, {
		emblem: await image(admin, "", readFileSync(new URL("emblem-wide.png", import.meta.url))),
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
	await shoot(page, "calendar", MONTH_GRIDS[0] ?? "/calendar");
});

for (const route of ROUTES) {
	test(`no sideways scrolling: ${route}`, async ({ page }) => {
		for (const width of WIDTHS) {
			// oxlint-disable-next-line no-await-in-loop -- one width at a time.
			await page.setViewportSize({ width, height: 900 });
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await page.goto(route);
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await page.evaluate(async () => document.fonts.ready);
			// oxlint-disable-next-line no-await-in-loop -- see above.
			expect.soft(await sideways(page), `${route} at ${width}px`).toEqual([]);
		}
	});
}

test("no sideways scrolling: a newsletter issue's own page", async ({ page }) => {
	await page.goto("/newsletters");
	const route = await page
		.getByTestId("newsletter-archive")
		.getByRole("link")
		.first()
		.getAttribute("href");
	for (const width of WIDTHS) {
		// oxlint-disable-next-line no-await-in-loop -- one width at a time.
		await page.setViewportSize({ width, height: 900 });
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await page.goto(route ?? "/newsletters");
		// oxlint-disable-next-line no-await-in-loop -- see above.
		expect.soft(await sideways(page), `${route} at ${width}px`).toEqual([]);
	}
});

for (const [surface, paths, days] of [
	["the week strip", ["/", crowdedWeekPath], '[data-testid="week"] > li'],
	["the month grid", MONTH_GRIDS, '[data-testid="month-grid"] td[data-date]'],
] as const) {
	test(`every entry and its body's name stay inside its day on ${surface}`, async ({ page }) => {
		for (const path of paths) {
			for (const width of CALENDAR_WIDTHS) {
				// oxlint-disable-next-line no-await-in-loop -- one page and width at a time.
				await page.setViewportSize({ width, height: 900 });
				// oxlint-disable-next-line no-await-in-loop -- see above.
				await page.goto(path);
				// oxlint-disable-next-line no-await-in-loop -- see above.
				await page.evaluate(async () => document.fonts.ready);
				// oxlint-disable-next-line no-await-in-loop -- see above.
				const { entries, out } = await spills(page, days);
				expect.soft(out, `${path} at ${width}px`).toEqual([]);
				expect(entries, `${path} has entries at ${width}px`).toBeGreaterThan(0);
			}
		}
	});
}

test("emblems share one slot and the bodies' names line up", async ({ page }) => {
	for (const width of WIDTHS) {
		// oxlint-disable-next-line no-await-in-loop -- one width at a time.
		await page.setViewportSize({ width, height: 900 });
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await page.goto("/bodies");
		// oxlint-disable-next-line no-await-in-loop -- see above.
		const cards = await page.getByTestId("body-card").evaluateAll((all) =>
			all.map((card) => {
				const emblem = card.querySelector("img")?.getBoundingClientRect();
				const text = card.querySelector('[class*="body-card__text"]')?.getBoundingClientRect();
				return {
					emblem: emblem && { width: emblem.width, height: emblem.height },
					indent: Math.round((text?.left ?? 0) - card.getBoundingClientRect().left),
				};
			}),
		);
		const emblems = cards.flatMap((card) => (card.emblem === undefined ? [] : [card.emblem]));
		expect(
			emblems.length,
			"the wide, tall and square emblems are all shown",
		).toBeGreaterThanOrEqual(3);
		expect
			.soft(
				new Set(emblems.map((box) => `${box.width}x${box.height}`)).size,
				`one emblem slot at ${width}px`,
			)
			.toBe(1);
		expect
			.soft(new Set(cards.map((card) => card.indent)).size, `names line up at ${width}px`)
			.toBe(1);
	}
});

test("the search field shows a 2px focus ring like every other control", async ({ page }) => {
	await page.goto("/");
	const field = page.getByRole("search").locator("input");
	await field.focus();
	const ring = await field.evaluate((el) => {
		const style = getComputedStyle(el);
		return { style: style.outlineStyle, width: style.outlineWidth, colour: style.outlineColor };
	});
	expect(ring).toMatchObject({ style: "solid", width: "2px" });
	expect(ring.colour).not.toMatch(/^rgba\(\d+, \d+, \d+, 0\)$/);
});
