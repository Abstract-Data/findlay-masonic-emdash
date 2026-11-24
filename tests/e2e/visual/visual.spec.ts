import { readdirSync, readFileSync } from "node:fs";
import { AxeBuilder } from "@axe-core/playwright";
import type { APIRequestContext, Page, PlaywrightWorkerArgs } from "@playwright/test";
import { API_HEADERS } from "../body-access";
import { PUBLIC_ROUTES } from "../public/routes";
import { storageStatePath } from "../roles";
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
import {
	FUZZ_BODY,
	FUZZ_ENTRIES,
	FUZZ_NEWS,
	FUZZ_PAGE,
	FUZZ_STATED_BODY,
	FUZZ_TAG,
	FUZZ_WORD,
	purgeFuzz,
	SCHEMA_COLLECTIONS,
	seedFuzz,
} from "./fuzz";

// The site as built, with the content it will really carry: home, a body page and the Temple
// calendar at 1280 and 390 px, light and dark, for comparing with docs/design/direction-c/C-*.png
// by eye. Then every page file, with a long unbroken word and link in every text field
// (./fuzz.ts), checked at five widths for sideways scrolling and for any box its content spills
// out of, and every calendar entry checked to stay inside its day. It seeds a week like the
// mockup's and, nine weeks on, a crowded one, so it runs after every other project. Set
// VISUAL_OUT to keep the screenshots (docs/design/direction-c/built); otherwise they go to the
// test's output folder.

const today = findlayToday();
const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay());
const day = (offset: number) => addDays(sunday, offset);
const SAMPLE = `visual-${sunday}`;
const year = Number(today.slice(0, 4));
// Far enough on to fall in a month of its own, so the mockup's month stays as the mockup drew it.
const crowded = addDays(sunday, 63);
const crowdedDay = addDays(crowded, 3);

const LONG_TITLE = "Annual Thanksgiving dinner for the widows and their families";

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

/** Seven entries on one day, every body among them, one with a long title. */
const CROWDED: readonly Sample[] = [
	event("blue-lodge", "crowded-1", LONG_TITLE, crowdedDay, "08:00", "10:00"),
	event("chapter", "crowded-2", "Chapter officers meeting", crowdedDay, "10:30", "11:30"),
	event("council", "crowded-3", "Scholarship committee lecture", crowdedDay, "12:00", "13:00"),
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

const notice = (
	body: BodySlug,
	slug: string,
	title: string,
	minutesAgo: number,
	text = "Members and families are welcome. Dinner is served in the dining room beforehand.",
): Sample => ({
	body,
	slug: `${SAMPLE}-${slug}`,
	fields: {
		title,
		content: paragraph(text),
		publish_date: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
	},
});

// The three newest are the mockup's notices on the home page; the long one is on /news.
const NEWS: readonly Sample[] = [
	notice("blue-lodge", "election", "Election of officers at the next stated meeting", 3),
	notice("eastern-star", "bake-sale", "Holiday bake sale this Saturday", 2),
	notice("temple-board", "closed", "Building closed Thursday for floor refinishing", 0),
	notice("eastern-star", "long-title", LONG_TITLE, 10),
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
	"/calendar",
	`/calendar?month=${day(3).slice(0, 7)}`,
	`/calendar?month=${crowdedDay.slice(0, 7)}`,
];

/**
 * Every page file in src/pages, at a URL that shows the fuzz content when the page takes a slug.
 * A newsletter issue's slug is generated, so its check finds one on the archive.
 */
const PAGE_FILES: Readonly<Record<string, string | null>> = {
	"404.astro": "/no-such-page",
	"index.astro": "/",
	"bodies/index.astro": "/bodies",
	"bodies/[slug]/index.astro": `/bodies/${FUZZ_BODY}`,
	"bodies/[slug]/calendar.astro": `/bodies/${FUZZ_BODY}/calendar`,
	"bodies/[slug]/news/index.astro": `/bodies/${FUZZ_BODY}/news`,
	"bodies/[slug]/news/[news].astro": `/bodies/${FUZZ_BODY}/news/${FUZZ_NEWS}`,
	"calendar.astro": "/calendar",
	"news/index.astro": "/news",
	"news/[slug].astro": `/news/${FUZZ_NEWS}`,
	"newsletters/index.astro": "/newsletters",
	"newsletters/[slug].astro": null,
	"pages/[slug].astro": `/pages/${FUZZ_PAGE}`,
};

/** Pages that show fuzz text, so a check of them cannot pass on a page without it. */
const FUZZ_ROUTES: readonly string[] = [
	...Object.values(PAGE_FILES).filter(
		(route): route is string =>
			route !== null && route !== "/no-such-page" && route !== "/newsletters",
	),
	`/bodies/${FUZZ_STATED_BODY}`,
	`/?body=${FUZZ_BODY}`,
	`/calendar?body=${FUZZ_BODY}`,
	`/news?body=${FUZZ_BODY}`,
	`/bodies/${FUZZ_BODY}/news?tag=${FUZZ_TAG}`,
];

/** Every public page: each page file, the shared list, each body's pages, the crowded week. */
const ROUTES = [
	...new Set<string>([
		...FUZZ_ROUTES,
		"/no-such-page",
		"/newsletters",
		...PUBLIC_ROUTES,
		...Object.keys(BODIES).flatMap((slug) => [
			`/bodies/${slug}`,
			`/bodies/${slug}/calendar?month=${crowdedDay.slice(0, 7)}`,
			`/bodies/${slug}/news`,
		]),
		crowdedWeekPath,
		...MONTH_GRIDS,
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

/**
 * What does not fit at this width: the page scrolling sideways, and each innermost box whose
 * content runs past its right edge without being a scroller or clipped on purpose.
 */
async function overflows(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const root = document.documentElement;
		// oxlint-disable-next-line unicorn/consistent-function-scoping -- it runs in the page.
		const name = (el: Element) =>
			`${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
		const over = root.scrollWidth - root.clientWidth;
		const spilled = [...document.body.querySelectorAll("*")].filter(
			(el) =>
				el.clientWidth > 0 &&
				el.scrollWidth > el.clientWidth + 1 &&
				getComputedStyle(el).overflowX === "visible",
		);
		const innermost = spilled.filter(
			(el) => !spilled.some((other) => other !== el && el.contains(other)),
		);
		return [
			...(over > 0 ? [`the page scrolls sideways by ${over}px`] : []),
			...innermost
				.slice(0, 6)
				.map((el) => `${name(el)} runs ${el.scrollWidth - el.clientWidth}px past its box`),
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
		// At 320 px a name needs the room more than it needs to line up.
		if (width > 320) {
			expect
				.soft(new Set(cards.map((card) => card.indent)).size, `names line up at ${width}px`)
				.toBe(1);
		}
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

/** An API client signed in as the Admin, for a hook that has no test fixtures. */
async function adminRequest(playwright: PlaywrightWorkerArgs["playwright"], baseURL = "") {
	return playwright.request.newContext({
		baseURL,
		ignoreHTTPSErrors: true,
		storageState: storageStatePath("admin"),
		extraHTTPHeaders: { ...API_HEADERS, Origin: new URL(baseURL).origin },
	});
}

test.describe("a long word or link in every text field", () => {
	test.beforeAll(async ({ playwright }, info) => {
		const admin = await adminRequest(playwright, info.project.use.baseURL);
		await seedFuzz(admin, readFileSync(new URL("emblem-wide.png", import.meta.url)));
		await admin.dispose();
	});

	// FUZZ_KEEP=1 leaves the fuzz content in place to look at.
	test.afterAll(async ({ playwright }, info) => {
		if (process.env.FUZZ_KEEP === "1") return;
		const admin = await adminRequest(playwright, info.project.use.baseURL);
		await purgeFuzz(admin);
		await admin.dispose();
	});

	test("every page file and every collection in the schema is fuzzed", () => {
		const files = readdirSync("src/pages", { recursive: true, encoding: "utf8" })
			.filter((file) => file.endsWith(".astro"))
			.map((file) => file.replaceAll("\\", "/"));
		expect(files.toSorted(), "page files the check visits").toEqual(
			Object.keys(PAGE_FILES).toSorted(),
		);
		expect(new Set(FUZZ_ENTRIES.map((entry) => entry.collection))).toEqual(
			new Set(SCHEMA_COLLECTIONS),
		);
	});

	for (const route of ROUTES) {
		test(`nothing spills sideways: ${route}`, async ({ page }) => {
			for (const width of WIDTHS) {
				// oxlint-disable-next-line no-await-in-loop -- one width at a time.
				await page.setViewportSize({ width, height: 900 });
				// oxlint-disable-next-line no-await-in-loop -- see above.
				await page.goto(route);
				// oxlint-disable-next-line no-await-in-loop -- see above.
				await page.evaluate(async () => document.fonts.ready);
				if (FUZZ_ROUTES.includes(route)) {
					// oxlint-disable-next-line no-await-in-loop -- see above.
					await expect(page.locator("main"), `${route} shows the long word`).toContainText(
						FUZZ_WORD,
					);
				}
				// oxlint-disable-next-line no-await-in-loop -- see above.
				expect.soft(await overflows(page), `${route} at ${width}px`).toEqual([]);
			}
		});
	}

	test("nothing spills sideways: a newsletter issue's own page", async ({ page }) => {
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
			expect.soft(await overflows(page), `${route} at ${width}px`).toEqual([]);
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

	test("pages with the long word and link are AA in both schemes", async ({ page }) => {
		const routes = [
			"/",
			`/bodies/${FUZZ_BODY}`,
			`/bodies/${FUZZ_BODY}/news/${FUZZ_NEWS}`,
			`/pages/${FUZZ_PAGE}`,
		];
		for (const route of routes) {
			for (const scheme of ["light", "dark"] as const) {
				// oxlint-disable-next-line no-await-in-loop -- one page and scheme at a time.
				await page.emulateMedia({ colorScheme: scheme });
				// oxlint-disable-next-line no-await-in-loop -- see above.
				await page.goto(route);
				// oxlint-disable-next-line no-await-in-loop -- see above.
				const results = await new AxeBuilder({ page })
					.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
					.analyze();
				console.log(`axe / fuzz ${route} (${scheme}): ${results.violations.length} violations`);
				expect
					.soft(
						results.violations.map((v) => v.id),
						`${route} (${scheme})`,
					)
					.toEqual([]);
			}
		}
	});
});
