import { parseEventSeries } from "@adapters/emdash/parse";
import type { BodyId, EntryId } from "@core/ids";
import { NEWS_PAGE_SIZE, type NewsPage } from "@core/news/paging";
import type { EventSeries } from "@core/recurrence/series";
import {
	extractPlainText,
	getEmDashCollection,
	getEmDashEntry,
	type CacheHint,
	type CollectionResult,
} from "emdash";
import {
	newestFirst,
	parseBodyView,
	parseNewsView,
	parseOfficerView,
	type BodyView,
	type NewsView,
	type OfficerView,
} from "./views";

/** A value and the cache hint of the content it was read from. */
export interface Loaded<T> {
	readonly value: T;
	readonly hint: CacheHint;
}

export interface Calendar {
	readonly series: readonly EventSeries[];
	/** Plain-text descriptions for ICS feeds. */
	readonly descriptions: ReadonlyMap<EntryId, string>;
	/** Each series by id, for an agenda's locations. */
	readonly byId: ReadonlyMap<EntryId, EventSeries>;
}

/** A failed read throws, so a page never shows "nothing scheduled" for a database error. */
function entries<T>(result: CollectionResult<T>): CollectionResult<T>["entries"] {
	if (result.error !== undefined) throw result.error;
	return result.entries;
}

const NEWEST = { publish_date: "desc" } as const;

const order = (data: { display_order?: number }) => data.display_order ?? Number.MAX_SAFE_INTEGER;

/** FR-1.2: every published body in display order; bodies without one come last. */
export async function loadBodies(): Promise<Loaded<BodyView[]>> {
	const result = await getEmDashCollection("bodies", { orderBy: { display_order: "asc" } });
	const bodies = entries(result)
		.toSorted((a, b) => order(a.data) - order(b.data))
		.flatMap((entry) => parseBodyView(entry) ?? []);
	return { value: bodies, hint: result.cacheHint };
}

export async function loadBody(slug: string): Promise<Loaded<BodyView | null>> {
	const result = await getEmDashEntry("bodies", slug);
	if (result.error !== undefined) throw result.error;
	return {
		value: result.entry === null ? null : parseBodyView(result.entry),
		hint: result.cacheHint,
	};
}

/**
 * The published events of the given bodies. Recurring series can start years back, so none are
 * left out by date; an event whose body is not published is left out.
 */
export async function loadCalendar(bodies: readonly BodyView[]): Promise<Loaded<Calendar>> {
	const ids = bodies.map((body) => body.id);
	if (ids.length === 0) {
		return { value: { series: [], descriptions: new Map(), byId: new Map() }, hint: {} };
	}
	const result = await getEmDashCollection("events", { where: { body: ids } });
	const wanted = new Set<BodyId>(ids);
	const series: EventSeries[] = [];
	const descriptions = new Map<EntryId, string>();
	for (const entry of entries(result)) {
		const parsed = parseEventSeries({ ...entry.data });
		if (!parsed.ok || !wanted.has(parsed.value.body)) continue;
		series.push(parsed.value);
		const text = extractPlainText(entry.data.description ?? []).trim();
		if (text !== "") descriptions.set(parsed.value.id, text);
	}
	return {
		value: { series, descriptions, byId: new Map(series.map((s) => [s.id, s])) },
		hint: result.cacheHint,
	};
}

export async function loadOfficers(body: BodyId): Promise<Loaded<OfficerView[]>> {
	const result = await getEmDashCollection("officers", { where: { body } });
	return {
		value: entries(result).flatMap((entry) => parseOfficerView(entry) ?? []),
		hint: result.cacheHint,
	};
}

/** All of one body's published news, newest first (FR-3.3 filters tags in memory). */
export async function loadBodyNews(body: BodyId): Promise<Loaded<NewsView[]>> {
	const result = await getEmDashCollection("news", { where: { body }, orderBy: NEWEST });
	return { value: views(entries(result)), hint: result.cacheHint };
}

/** FR-3.4: one page of the given bodies' news, newest first. */
export async function loadNewsPage(
	bodies: readonly BodyView[],
	page: number,
	size = NEWS_PAGE_SIZE,
): Promise<Loaded<NewsPage<NewsView>>> {
	if (bodies.length === 0) {
		return { value: { items: [], page, hasNewer: page > 1, hasOlder: false }, hint: {} };
	}
	const result = await getEmDashCollection("news", {
		where: { body: bodies.map((body) => body.id) },
		orderBy: NEWEST,
		limit: size,
		offset: (page - 1) * size,
	});
	return {
		value: {
			items: views(entries(result)),
			page,
			hasNewer: page > 1,
			hasOlder: result.hasMore === true,
		},
		hint: result.cacheHint,
	};
}

/** Each published news item's slug to the slug of its body, for the given (published) bodies. */
export async function loadNewsHomes(
	bodies: readonly BodyView[],
): Promise<ReadonlyMap<string, string>> {
	if (bodies.length === 0) return new Map();
	const result = await getEmDashCollection("news", { where: { body: bodies.map((b) => b.id) } });
	const slugs = new Map(bodies.map((body) => [body.id, body.slug]));
	return new Map(
		views(entries(result)).flatMap((item) => {
			const body = slugs.get(item.body);
			return body === undefined ? [] : [[item.slug, body] as const];
		}),
	);
}

export async function loadNewsItem(slug: string): Promise<Loaded<NewsView | null>> {
	const result = await getEmDashEntry("news", slug);
	if (result.error !== undefined) throw result.error;
	return {
		value: result.entry === null ? null : parseNewsView(result.entry),
		hint: result.cacheHint,
	};
}

function views(list: Parameters<typeof parseNewsView>[0][]): NewsView[] {
	return list.flatMap((entry) => parseNewsView(entry) ?? []).toSorted(newestFirst);
}
