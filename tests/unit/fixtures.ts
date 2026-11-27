// Fixtures stand in for the parse boundary, so they mint brands with assertions.
/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { Editor } from "@core/acl/policy";
import type { AbsoluteUrl, BodyId, EntryId, IssueId, TagSlug, UserId } from "@core/ids";
import { parseRRule } from "@core/recurrence/rrule";
import type { EventSeries, EventTiming, RRule, RuleParts } from "@core/recurrence/series";
import type { Revision } from "@core/newsletter/key";
import { Temporal } from "temporal-polyfill";

/** Fake ULIDs: valid Crockford base32, readable in failure output. */
const ulid = (prefix: string, n: number) => `01J${prefix}${String(n).padStart(22, "0")}`;

export const bodyId = (n: number) => ulid("B", n) as BodyId;
export const entryId = (n: number) => ulid("E", n) as EntryId;
export const issueId = (n: number) => ulid("N", n) as IssueId;
/** Stored issues have UUID ids (crypto.randomUUID in the plugin). */
export const issueUuid = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}` as IssueId;
export const userId = (name: string) => name as UserId;
export const tag = (slug: string) => slug as TagSlug;
export const url = (href: string) => href as AbsoluteUrl;
export const revision = (n: number) => n as Revision;

export const LODGE = bodyId(1);
export const CHAPTER = bodyId(2);

export function editor(id: string, grants: readonly BodyId[] = [], isAdmin = false): Editor {
	return { id: userId(id), isAdmin, grants: new Set(grants) };
}

export const instant = (iso: string) => Temporal.Instant.from(iso);
export const date = (iso: string) => Temporal.PlainDate.from(iso);

export function timed(start: string, end: string): EventTiming {
	return {
		kind: "timed",
		start: Temporal.PlainDateTime.from(start),
		end: Temporal.PlainDateTime.from(end),
	};
}

export function allDay(first: string, last = first): EventTiming {
	return { kind: "all-day", first: date(first), last: date(last) };
}

/** Skips parseRRule, to show what the library does with a rule the parser refuses. */
export const unvalidatedRule = (parts: RuleParts) => parts as RRule;

/** A rule known to be valid; fails the test loudly otherwise. */
export function rule(text: string, timing: EventTiming): RRule {
	const parsed = parseRRule(text, timing);
	if (!parsed.ok) throw new Error(`fixture rule ${text} rejected: ${JSON.stringify(parsed.error)}`);
	return parsed.value;
}

export function series(
	overrides: Partial<Omit<EventSeries, "recurrence">> & {
		readonly rrule?: string;
		readonly except?: readonly string[];
	} = {},
): EventSeries {
	const { rrule, except = [], ...rest } = overrides;
	const timing = rest.timing ?? timed("2027-01-12T19:30", "2027-01-12T21:30");
	return {
		id: entryId(1),
		body: LODGE,
		title: "Stated Meeting",
		location: "Findlay Masonic Temple",
		isStatedMeeting: false,
		...rest,
		timing,
		recurrence:
			rrule === undefined ? null : { rule: rule(rrule, timing), except: except.map(date) },
	};
}
