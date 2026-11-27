import type { APIRequestContext } from "@playwright/test";
import { data, test as base, uniquePng, unique } from "../body-access";

export { expect } from "../body-access";
export { unique };

export const CONTENT = "/_emdash/api/content";

/** The six seeded bodies (FR-9.2), by slug. */
export const BODIES = {
	"blue-lodge": "Findlay Lodge No. 227",
	chapter: "Findlay Chapter No. 58",
	council: "Findlay Council No. 50",
	commandery: "Findlay Commandery No. 49",
	"eastern-star": "Findlay Chapter, Order of the Eastern Star No. 23",
	"temple-board": "Findlay Temple Board",
} as const;

export type BodySlug = keyof typeof BODIES;

interface Fixtures {
	admin: APIRequestContext;
	/** Body slug to its entry id. */
	ids: Readonly<Record<BodySlug, string>>;
}

/**
 * Pages are visited as an anonymous visitor: the project's storage state is `anon`, and EmDash
 * serves visitors a reduced runtime, so a page checked only as Admin can be empty for them.
 * Content is seeded through the API as Admin.
 */
export const test = base.extend<Fixtures>({
	admin: async ({ as }, use) => {
		await use(await as("admin"));
	},
	ids: async ({ admin }, use) => {
		const list = await data<{ items: { id: string; slug: string }[] }>(
			admin.get(`${CONTENT}/bodies?limit=50`),
		);
		const entries = Object.keys(BODIES).map((slug) => [
			slug,
			list.items.find((item) => item.slug === slug)?.id ?? "",
		]);
		await use(Object.fromEntries(entries));
	},
});

/** Creates and publishes an entry; returns its id and slug. */
export async function publish(
	admin: APIRequestContext,
	collection: string,
	fields: Record<string, unknown>,
	slug?: string,
): Promise<{ id: string; slug: string }> {
	const created = await data<{ item: { id: string; slug: string } }>(
		admin.post(`${CONTENT}/${collection}`, {
			data: { data: fields, ...(slug === undefined ? {} : { slug }) },
		}),
	);
	await data(admin.post(`${CONTENT}/${collection}/${created.item.id}/publish`, { data: {} }));
	return { id: created.item.id, slug: created.item.slug };
}

/**
 * A page in the pages collection, created and published when the database lacks it. Its copy
 * is migrated in M6; here it stands in so the route can be checked (FR-9.1).
 */
export async function ensurePage(
	admin: APIRequestContext,
	slug: string,
	title: string,
	text: string,
): Promise<void> {
	const existing = await admin.get(`${CONTENT}/pages/${slug}`);
	if (existing.ok()) return;
	await publish(admin, "pages", { title, content: paragraph(text) }, slug);
}

/** Updates a published body's fields and publishes the change. */
export async function updateBody(
	admin: APIRequestContext,
	id: string,
	fields: Record<string, unknown>,
): Promise<void> {
	await data(admin.put(`${CONTENT}/bodies/${id}`, { data: { data: fields } }));
	await data(admin.post(`${CONTENT}/bodies/${id}/publish`, { data: {} }));
}

/**
 * Trashes what an earlier run of the same spec left in a body, found by its title prefix, so a
 * rerun on the same database starts from the seeded state.
 */
export async function clearRun(
	admin: APIRequestContext,
	collection: string,
	body: string,
	prefix: string,
	field = "title",
): Promise<void> {
	let cursor: string | undefined;
	do {
		const query = `limit=100${cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`}`;
		// oxlint-disable-next-line no-await-in-loop -- pages follow one another.
		const page = await data<{
			items: { id: string; data: Record<string, unknown> }[];
			nextCursor?: string;
		}>(admin.get(`${CONTENT}/${collection}?${query}`));
		const stale = page.items.filter((item) => {
			const value = item.data[field];
			return item.data.body === body && typeof value === "string" && value.startsWith(prefix);
		});
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await Promise.all(
			stale.map(async (item) => data(admin.delete(`${CONTENT}/${collection}/${item.id}`))),
		);
		cursor = page.nextCursor;
	} while (cursor !== undefined);
}

/** Uploads a PNG (by default a 1x1 one) to the media library; returns an image field value. */
export async function image(admin: APIRequestContext, alt: string, png?: Buffer) {
	const uploaded = await data<{ item: { id: string } }>(
		admin.post("/_emdash/api/media", {
			multipart: {
				file: { name: `${unique("emblem")}.png`, mimeType: "image/png", buffer: uniquePng(png) },
			},
		}),
	);
	return { id: uploaded.item.id, alt };
}

/** Today's date in Findlay, as "YYYY-MM-DD". */
export function findlayToday(): string {
	return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/** A Findlay wall-clock time ("2027-01-15", "19:30") as the UTC instant the content API takes. */
export function findlayTime(date: string, time: string): string {
	const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
	const [hour = 0, minute = 0] = time.split(":").map(Number);
	const asUtc = Date.UTC(year, month - 1, day, hour, minute);
	const offset = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		timeZoneName: "longOffset",
	})
		.formatToParts(new Date(asUtc))
		.find((part) => part.type === "timeZoneName")?.value;
	const [, sign = "-", hours = "0", minutes = "0"] =
		/GMT([+-])(\d{2}):(\d{2})/.exec(offset ?? "") ?? [];
	const offsetMinutes = (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
	return new Date(asUtc - offsetMinutes * 60_000).toISOString();
}

/** A local date `days` after `date`, as "YYYY-MM-DD" (calendar arithmetic, no time zone). */
export function addDays(date: string, days: number): string {
	const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The month `months` after the one `date` falls in, as "YYYY-MM". */
export function addMonths(date: string, months: number): string {
	const [year = 0, month = 1] = date.split("-").map(Number);
	return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

/** The dates in a "YYYY-MM" month that fall on `weekday` (0 is Sunday). */
export function weekdaysIn(month: string, weekday: number): string[] {
	const [year = 0, index = 1] = month.split("-").map(Number);
	const days: string[] = [];
	for (let day = 1; day <= 31; day += 1) {
		const date = new Date(Date.UTC(year, index - 1, day));
		if (date.getUTCMonth() !== index - 1) break;
		if (date.getUTCDay() === weekday) days.push(date.toISOString().slice(0, 10));
	}
	return days;
}

/** "Lorem." as a one-paragraph Portable Text value. */
export function paragraph(text: string) {
	return [{ _type: "block", _key: "p1", children: [{ _type: "span", _key: "s1", text }] }];
}
