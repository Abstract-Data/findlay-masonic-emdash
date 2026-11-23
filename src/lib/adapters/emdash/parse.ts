import type { Editor } from "@core/acl/policy";
import {
	err,
	ok,
	type AbsoluteUrl,
	type BodyId,
	type EntryId,
	type Result,
	type TagSlug,
	type UserId,
} from "@core/ids";
import { parseRRule, type RRuleError } from "@core/recurrence/rrule";
import type { EventSeries, EventTiming } from "@core/recurrence/series";
import { SITE_TZ } from "@core/time";
import { Temporal } from "temporal-polyfill";

export type ParseError =
	| { readonly code: "invalid-field"; readonly field: string }
	| { readonly code: "end-before-start" }
	| { readonly code: "rrule"; readonly error: RRuleError };

/** EmDash entry and body ids are ULIDs (ulidx, uppercase Crockford base32). */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ADMIN_ROLE = 50;

const invalid = (field: string): Result<never, ParseError> => err({ code: "invalid-field", field });

// Type predicates mint the brands: each one is the validation the brand stands for.
const isUlid = (raw: unknown) => typeof raw === "string" && ULID.test(raw);
const isBodyId = (raw: unknown): raw is BodyId => isUlid(raw);
const isEntryId = (raw: unknown): raw is EntryId => isUlid(raw);
const isUserId = (raw: unknown): raw is UserId => typeof raw === "string" && raw.trim() !== "";
const isWebUrl = (raw: unknown): raw is AbsoluteUrl =>
	typeof raw === "string" && URL.canParse(raw) && /^https?:$/.test(new URL(raw).protocol);
const isTagSlug = (slug: string): slug is TagSlug => slug !== "";

export function parseBodyId(raw: unknown): BodyId | null {
	return isBodyId(raw) ? raw : null;
}

export function parseEntryId(raw: unknown): EntryId | null {
	return isEntryId(raw) ? raw : null;
}

export function parseUserId(raw: unknown): UserId | null {
	return isUserId(raw) ? raw : null;
}

export function parseAbsoluteUrl(raw: unknown): AbsoluteUrl | null {
	return isWebUrl(raw) ? raw : null;
}

/** "Ritual Work " and "ritual-work" are the same tag. */
export function parseTag(raw: string): TagSlug | null {
	const slug = raw.trim().toLowerCase().replaceAll(/\s+/g, "-");
	return isTagSlug(slug) ? slug : null;
}

/** `news.tags` is a repeater of `{ tag }` rows. Blank rows are dropped, duplicates merged. */
export function parseTags(rows: unknown): Result<TagSlug[], ParseError> {
	const values = rowValues(rows, "tag");
	return values === null
		? invalid("tags")
		: ok([...new Set(values.flatMap((v) => parseTag(v) ?? []))]);
}

/** `bodies.tag_vocabulary` is a repeater of `{ slug, label }` rows. */
export function parseTagVocabulary(rows: unknown): Result<ReadonlySet<TagSlug>, ParseError> {
	const values = rowValues(rows, "slug");
	return values === null
		? invalid("tag_vocabulary")
		: ok(new Set(values.flatMap((v) => parseTag(v) ?? [])));
}

/** EmDash stores datetimes as UTC instants; core works in SITE_TZ wall time. */
export function parseWallTime(raw: unknown): Temporal.PlainDateTime | null {
	if (typeof raw !== "string") return null;
	try {
		return Temporal.Instant.from(raw).toZonedDateTimeISO(SITE_TZ).toPlainDateTime();
	} catch {
		return null;
	}
}

export function parseEditor(
	user: { readonly id: unknown; readonly role: unknown },
	grants: readonly unknown[],
): Result<Editor, ParseError> {
	const id = parseUserId(user.id);
	if (id === null) return invalid("id");
	if (typeof user.role !== "number") return invalid("role");
	const bodies = allOrNothing(grants.map(parseBodyId));
	if (bodies === null) return invalid("grants");
	return ok({ id, isAdmin: user.role >= ADMIN_ROLE, grants: new Set(bodies) });
}

/** An `events` entry's `data`, keyed by the seed's field slugs. */
export function parseEventSeries(
	data: Readonly<Record<string, unknown>>,
): Result<EventSeries, ParseError> {
	const id = parseEntryId(data.id);
	if (id === null) return invalid("id");
	const body = parseBodyId(data.body);
	if (body === null) return invalid("body");
	const title = text(data.title);
	if (title === null) return invalid("title");
	const start = parseWallTime(data.start);
	if (start === null) return invalid("start");
	const end = parseWallTime(data.end);
	if (end === null) return invalid("end");
	const except = parseExdates(data.exdates);
	if (except === null) return invalid("exdates");

	const timing = toTiming(start, end, data.all_day === true);
	if (timing === null) return err({ code: "end-before-start" });
	const rawRule = text(data.rrule);
	const rule = rawRule === null ? null : parseRRule(rawRule, timing);
	if (rule !== null && !rule.ok) return err({ code: "rrule", error: rule.error });

	return ok({
		id,
		body,
		title,
		location: text(data.location),
		timing,
		recurrence: rule === null ? null : { rule: rule.value, except },
		isStatedMeeting: data.is_stated_meeting === true,
	});
}

// An all-day end at local midnight is exclusive, as calendar pickers store it.
function toTiming(
	start: Temporal.PlainDateTime,
	end: Temporal.PlainDateTime,
	allDay: boolean,
): EventTiming | null {
	if (!allDay) {
		return Temporal.PlainDateTime.compare(end, start) < 0 ? null : { kind: "timed", start, end };
	}
	const first = start.toPlainDate();
	const endDate = end.toPlainDate();
	const exclusive =
		end.hour === 0 && end.minute === 0 && Temporal.PlainDate.compare(endDate, first) > 0;
	const last = exclusive ? endDate.subtract({ days: 1 }) : endDate;
	return Temporal.PlainDate.compare(last, first) < 0 ? null : { kind: "all-day", first, last };
}

/** `events.exdates` is a JSON array of local "YYYY-MM-DD" dates. */
function parseExdates(raw: unknown): Temporal.PlainDate[] | null {
	if (raw === null || raw === undefined) return [];
	if (!Array.isArray(raw)) return null;
	return allOrNothing(
		raw.map((value: unknown) => {
			if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
			try {
				return Temporal.PlainDate.from(value, { overflow: "reject" });
			} catch {
				return null;
			}
		}),
	);
}

function rowValues(rows: unknown, key: string): string[] | null {
	if (rows === null || rows === undefined) return [];
	if (!Array.isArray(rows)) return null;
	return allOrNothing(
		rows.map((row: unknown) => {
			const value: unknown = typeof row === "object" && row !== null ? Reflect.get(row, key) : null;
			return typeof value === "string" ? value : value === undefined ? "" : null;
		}),
	);
}

function allOrNothing<T>(items: readonly (T | null)[]): T[] | null {
	const present = items.filter((item): item is T => item !== null);
	return present.length === items.length ? present : null;
}

function text(raw: unknown): string | null {
	return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}
