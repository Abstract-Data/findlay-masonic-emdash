import { TITLES_BY_BODY_TYPE, type BodyType } from "@core/acl/officer-titles";
import { parseMailbox } from "@core/address";
import { bodyColour, type BodyColour } from "@core/bodies/colour";
import { displayName } from "@core/bodies/label";
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
import { parseRRule, rruleErrorText, type RRuleError } from "@core/recurrence/rrule";
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

/**
 * EmDash's own test for an entry id (ContentRepository's ULID_PATTERN). A slug that passes it
 * is read as an id first, so it can make a route reach a different entry than its slug names.
 */
const EMDASH_ID_SHAPE = /^[0-9A-Z]{26}$/;

export function looksLikeEntryId(slug: string): boolean {
	return EMDASH_ID_SHAPE.test(slug);
}

/** Why a slug that looks like an entry id is refused below Admin (ADR-002). */
export function idLikeSlugText(slug: string): string {
	return `The slug ${slug} looks like an entry id, so it could make a change reach the wrong entry. Choose a slug made of words, such as spring-banquet.`;
}

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

/**
 * `bodies.contact_recipients` is a repeater of `{ email }` rows: the addresses a body's contact
 * form sends to (spec Q12), never rendered publicly. Each row is one address, bare or as
 * `Name <address>`; blank or malformed rows are dropped, and the save hook refuses a malformed
 * one (`unreadableRecipientRows`) so an editor never loses one unseen.
 */
export function parseRecipients(rows: unknown): string[] {
	return (rowValues(rows, "email") ?? []).flatMap((value) => parseMailbox(value) ?? []);
}

/** The 1-based numbers of the recipient rows that are neither blank nor one address. */
export function unreadableRecipientRows(rows: unknown): number[] {
	if (rows === null || rows === undefined) return [];
	if (!Array.isArray(rows)) return [1];
	return rows.flatMap((row: unknown, index) => {
		const value: unknown =
			typeof row === "object" && row !== null ? Reflect.get(row, "email") : null;
		if (value === undefined || (typeof value === "string" && value.trim() === "")) return [];
		return typeof value === "string" && parseMailbox(value) !== null ? [] : [index + 1];
	});
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

/** EmDash's Admin role. Everything below it is subject to body grants. */
export function isAdminRole(role: number): boolean {
	return role >= ADMIN_ROLE;
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
	return ok({ id, isAdmin: isAdminRole(user.role), grants: new Set(bodies) });
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
	const schedule = parseEventSchedule(data);
	if (!schedule.ok) return schedule;

	return ok({
		id,
		body,
		title,
		location: text(data.location),
		...schedule.value,
		isStatedMeeting: data.is_stated_meeting === true,
	});
}

/** FR-4.2: an event's timing and recurrence, the part of an `events` entry a save must keep valid. */
export function parseEventSchedule(
	data: Readonly<Record<string, unknown>>,
): Result<Pick<EventSeries, "timing" | "recurrence">, ParseError> {
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
	return ok({ timing, recurrence: rule === null ? null : { rule: rule.value, except } });
}

const NAIVE_DATETIME = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?))?$/;

/**
 * A datetime as a save submits it, made into the UTC instant EmDash will store. EmDash reads a
 * value without an offset as site time (settings.timezone is SITE_TZ); anything else is kept
 * as sent, for parseWallTime to accept or refuse.
 */
export function toStoredInstant(raw: unknown): unknown {
	if (typeof raw !== "string") return raw;
	const naive = NAIVE_DATETIME.exec(raw.trim());
	if (naive === null) return raw;
	try {
		const local = Temporal.PlainDateTime.from(`${naive[1]}T${naive[2] ?? "00:00"}`);
		return local.toZonedDateTime(SITE_TZ).toInstant().toString();
	} catch {
		return raw;
	}
}

/** Plain text for an editor whose save the parse boundary refused. */
export function parseErrorText(error: ParseError): string {
	switch (error.code) {
		case "invalid-field":
			return `The ${error.field.replaceAll("_", " ")} value is missing or not valid.`;
		case "end-before-start":
			return "The event ends before it starts. Set the end on or after the start.";
	}
	return rruleErrorText(error.error);
}

/** What the guard reads from a `bodies` entry. */
export interface BodyRecord {
	readonly id: BodyId;
	/** "Findlay Lodge No. 227", the name denial texts use. */
	readonly displayName: string;
	readonly bodyType: BodyType | null;
	/** FR-4.4: the chosen `colour`, else the body type's default. */
	readonly colour: BodyColour | null;
	readonly vocabulary: ReadonlySet<TagSlug>;
	/** `display_order`; a body without one sorts last. */
	readonly order: number;
}

const isBodyType = (raw: unknown): raw is BodyType =>
	typeof raw === "string" && Object.hasOwn(TITLES_BY_BODY_TYPE, raw);

/** A body whose vocabulary cannot be read keeps an empty one, so its tags fail closed. */
export function parseBodyRecord(entry: {
	readonly id: unknown;
	readonly data: unknown;
}): BodyRecord | null {
	const id = parseBodyId(entry.id);
	if (id === null || typeof entry.data !== "object" || entry.data === null) return null;
	const data = entry.data;
	const name = text(Reflect.get(data, "name")) ?? id;
	const number: unknown = Reflect.get(data, "number");
	const vocabulary = parseTagVocabulary(Reflect.get(data, "tag_vocabulary"));
	const rawType: unknown = Reflect.get(data, "body_type");
	const bodyType = isBodyType(rawType) ? rawType : null;
	const order: unknown = Reflect.get(data, "display_order");
	return {
		id,
		displayName: displayName(name, typeof number === "number" ? number : null),
		bodyType,
		colour: bodyColour(Reflect.get(data, "colour"), bodyType),
		vocabulary: vocabulary.ok ? vocabulary.value : new Set(),
		order: typeof order === "number" ? order : Number.MAX_SAFE_INTEGER,
	};
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
