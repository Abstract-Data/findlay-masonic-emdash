import { readFileSync } from "node:fs";
import type { APIRequestContext } from "@playwright/test";
import { data, uniquePng } from "../body-access";
import { addDays, CONTENT, findlayTime, findlayToday } from "../public/site";

/**
 * Long-token fuzz content (WCAG 1.4.10). Every text field of every collection in
 * seed/seed.json gets a token that cannot break at a space, and every Portable Text block the
 * site renders carries one too, so a page that lets a long word or link push it sideways fails
 * whichever element it is in. The field list is read from the schema: a new field is fuzzed
 * without anyone adding it here.
 */

/** 80 letters. */
export const FUZZ_WORD = `${"Freemasonry".repeat(7)}Lod`;
/** 120 characters. */
export const FUZZ_URL = `https://findlaymason.org/${"temple-floor-refinishing-".repeat(3)}contractor-schedule-${"x".repeat(5)}`;
export const FUZZ_TEXT = `${FUZZ_WORD} ${FUZZ_URL}`;

interface FieldSpec {
	readonly slug: string;
	readonly type: string;
	readonly validation?: {
		readonly options?: readonly string[];
		readonly subFields?: readonly FieldSpec[];
	};
}

interface CollectionSpec {
	readonly slug: string;
	readonly fields: readonly FieldSpec[];
}

const SCHEMA: readonly CollectionSpec[] = Reflect.get(
	Object(JSON.parse(readFileSync(new URL("../../../seed/seed.json", import.meta.url), "utf8"))),
	"collections",
);

/**
 * Text fields no visitor reads, or that must parse as something other than prose. Each entry
 * that needs one sets it below; the rest leave it empty.
 */
const MACHINE: Readonly<Record<string, string>> = {
	"bodies.contact_recipients.email": "one address; never shown on a public page",
	"bodies.tag_vocabulary.slug": "a tag slug, matched by news tags",
	"bodies.resend_topic_id": "a Resend id; never shown",
	"events.rrule": "an RRULE",
	"events.exdates": "dates the rule skips",
	"news.tags.tag": "a slug from the body's tag vocabulary",
};

export const FUZZ_TAG = "fuzz";

export interface Media {
	readonly id: string;
	readonly url: string;
}

let key = 0;
const next = (prefix: string) => `${prefix}${(key += 1)}`;
const span = (text: string, marks: string[] = []) => ({
	_type: "span",
	_key: next("s"),
	text,
	marks,
});
const block = (text: string, extra: Record<string, unknown> = {}) => ({
	_type: "block",
	_key: next("b"),
	style: "normal",
	markDefs: [],
	children: [span(text)],
	...extra,
});

const tableRow = (header: boolean, cells: readonly string[]) => ({
	_type: "tableRow",
	_key: next("r"),
	cells: cells.map((text) => ({
		_type: "tableCell",
		_key: next("c"),
		content: [span(text)],
		isHeader: header,
	})),
});

/** One of every Portable Text block the site's content uses, each holding the long token. */
export function fuzzRichText(media: Media): unknown[] {
	const link = next("l");
	return [
		{
			_type: "table",
			_key: next("t"),
			hasHeaderRow: true,
			rows: [
				tableRow(true, ["Degree", "Date", "Time", "Room"]),
				tableRow(false, ["Entered Apprentice", "March 3", "7:30 PM", "Lodge room"]),
				tableRow(false, [FUZZ_TEXT, "April 7", "7:30 PM", "Lodge room"]),
			],
		},
		block(`Paragraph ${FUZZ_TEXT} ends here.`),
		block(`Heading ${FUZZ_TEXT}`, { style: "h2" }),
		block(`Subheading ${FUZZ_TEXT}`, { style: "h3" }),
		block(`Bullet ${FUZZ_TEXT}`, { listItem: "bullet", level: 1 }),
		block(`Number ${FUZZ_TEXT}`, { listItem: "number", level: 1 }),
		block(`Quote ${FUZZ_TEXT}`, { style: "blockquote" }),
		{
			_type: "block",
			_key: next("b"),
			style: "normal",
			markDefs: [{ _type: "link", _key: link, href: FUZZ_URL }],
			children: [
				span("Link "),
				span(FUZZ_URL, [link]),
				span(" and code "),
				span(FUZZ_WORD, ["code"]),
			],
		},
		{
			_type: "code",
			_key: next("c"),
			language: "js",
			filename: FUZZ_TEXT,
			code: `const schedule = "${FUZZ_URL}"; // ${FUZZ_WORD}`,
		},
		{
			_type: "image",
			_key: next("i"),
			asset: { _ref: media.id, url: media.url },
			alt: "Fuzz image",
			caption: `Caption ${FUZZ_TEXT}`,
		},
	];
}

/** Every field of `collection` in the schema, filled: long text, the first option, one image. */
export function fuzzFields(
	collection: string,
	media: Media,
	given: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const spec = SCHEMA.find((candidate) => candidate.slug === collection);
	if (spec === undefined) throw new Error(`seed/seed.json has no collection "${collection}"`);
	const value = (field: FieldSpec, path: string): unknown => {
		if (path in MACHINE) return undefined;
		switch (field.type) {
			case "string":
			case "text":
				return FUZZ_TEXT;
			case "portableText":
				return fuzzRichText(media);
			case "image":
				return { id: media.id, alt: "Fuzz image" };
			case "select":
				return field.validation?.options?.[0];
			case "integer":
				return 99;
			case "boolean":
				return false;
			case "repeater":
				return [
					Object.fromEntries(
						(field.validation?.subFields ?? []).map((sub) => [
							sub.slug,
							value(sub, `${path}.${sub.slug}`),
						]),
					),
				];
			default:
				throw new Error(`the fuzz seed has no value for ${path} (${field.type}); give it one`);
		}
	};
	return Object.fromEntries(
		spec.fields.map((field) => {
			const path = `${collection}.${field.slug}`;
			return [field.slug, field.slug in given ? given[field.slug] : value(field, path)];
		}),
	);
}

/** Every collection in the schema, so a test can tell when one has no fuzz entry. */
export const SCHEMA_COLLECTIONS = SCHEMA.map((collection) => collection.slug);

export const FUZZ_BODY = "fuzz-note";
export const FUZZ_STATED_BODY = "fuzz-stated";
export const FUZZ_NEWS = "fuzz-news";
export const FUZZ_PAGE = "fuzz-page";

interface FuzzEntry {
	readonly collection: string;
	readonly slug: string;
	readonly fields: (ids: Readonly<Record<string, string>>, media: Media) => Record<string, unknown>;
}

const today = findlayToday();
const year = Number(today.slice(0, 4));
const weekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][
	new Date(`${today}T12:00:00Z`).getUTCDay()
];

/**
 * Two bodies: one with no stated meeting, whose card shows its schedule note, and one whose card
 * and page show a stated meeting. Then one entry of every other collection, in the week shown on
 * the home page.
 */
export const FUZZ_ENTRIES: readonly FuzzEntry[] = [
	...[FUZZ_BODY, FUZZ_STATED_BODY].map((slug) => ({
		collection: "bodies",
		slug,
		fields: (_: Readonly<Record<string, string>>, media: Media) =>
			fuzzFields("bodies", media, {
				contact_recipients: [{ email: "delivered@resend.dev" }],
				tag_vocabulary: [{ slug: FUZZ_TAG, label: FUZZ_TEXT }],
			}),
	})),
	{
		collection: "officers",
		slug: "fuzz-officer",
		fields: (ids, media) =>
			fuzzFields("officers", media, { body: ids[FUZZ_BODY], term_year: year, display_order: 1 }),
	},
	{
		collection: "events",
		slug: "fuzz-event",
		fields: (ids, media) =>
			fuzzFields("events", media, {
				body: ids[FUZZ_BODY],
				start: findlayTime(today, "19:00"),
				end: findlayTime(today, "21:00"),
			}),
	},
	{
		collection: "events",
		slug: "fuzz-event-all-day",
		fields: (ids, media) =>
			fuzzFields("events", media, {
				body: ids[FUZZ_BODY],
				start: findlayTime(addDays(today, 1), "00:00"),
				end: findlayTime(addDays(today, 2), "00:00"),
				all_day: true,
			}),
	},
	{
		collection: "events",
		slug: "fuzz-event-stated",
		fields: (ids, media) =>
			fuzzFields("events", media, {
				body: ids[FUZZ_STATED_BODY],
				start: findlayTime(today, "19:30"),
				end: findlayTime(today, "21:30"),
				rrule: `FREQ=WEEKLY;BYDAY=${weekday}`,
				is_stated_meeting: true,
			}),
	},
	{
		collection: "news",
		slug: FUZZ_NEWS,
		fields: (ids, media) =>
			fuzzFields("news", media, {
				body: ids[FUZZ_BODY],
				publish_date: new Date().toISOString(),
				tags: [{ tag: FUZZ_TAG }],
			}),
	},
	{
		collection: "pages",
		slug: FUZZ_PAGE,
		fields: (_, media) => fuzzFields("pages", media, {}),
	},
];

async function upload(admin: APIRequestContext, png: Buffer): Promise<Media> {
	const uploaded = await data<{ item: { id: string; url: string } }>(
		admin.post("/_emdash/api/media", {
			multipart: { file: { name: "fuzz.png", mimeType: "image/png", buffer: uniquePng(png) } },
		}),
	);
	return { id: uploaded.item.id, url: uploaded.item.url };
}

/** Removes every fuzz entry, live or trashed, so a rerun starts clean and leaves nothing. */
export async function purgeFuzz(admin: APIRequestContext): Promise<void> {
	for (const entry of [...FUZZ_ENTRIES].toReversed()) {
		// oxlint-disable-next-line no-await-in-loop -- entries go before the bodies they name.
		const live = await admin.get(`${CONTENT}/${entry.collection}/${entry.slug}`);
		if (live.ok()) {
			// oxlint-disable-next-line no-await-in-loop -- see above.
			const { item } = await data<{ item: { id: string } }>(Promise.resolve(live));
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await data(admin.delete(`${CONTENT}/${entry.collection}/${item.id}`));
		}
		// oxlint-disable-next-line no-await-in-loop -- see above.
		const trash = await data<{ items: { id: string; slug: string }[] }>(
			admin.get(`${CONTENT}/${entry.collection}/trash?limit=100`),
		);
		for (const trashed of trash.items.filter((item) => item.slug === entry.slug)) {
			// oxlint-disable-next-line no-await-in-loop -- see above.
			await data(admin.delete(`${CONTENT}/${entry.collection}/${trashed.id}/permanent`));
		}
	}
}

/** Publishes every fuzz entry; returns the bodies' ids by slug. */
export async function seedFuzz(
	admin: APIRequestContext,
	png: Buffer,
): Promise<Readonly<Record<string, string>>> {
	await purgeFuzz(admin);
	const media = await upload(admin, png);
	const ids: Record<string, string> = {};
	for (const entry of FUZZ_ENTRIES) {
		// oxlint-disable-next-line no-await-in-loop -- later entries name the bodies' ids.
		const created = await data<{ item: { id: string } }>(
			admin.post(`${CONTENT}/${entry.collection}`, {
				data: { data: entry.fields(ids, media), slug: entry.slug },
			}),
		);
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await data(
			admin.post(`${CONTENT}/${entry.collection}/${created.item.id}/publish`, { data: {} }),
		);
		ids[entry.slug] = created.item.id;
	}
	return ids;
}
