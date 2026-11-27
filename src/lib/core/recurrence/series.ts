import type { Temporal } from "temporal-polyfill";
import type { BodyId, Brand, EntryId } from "../ids";
import { SITE_TZ } from "../time";

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** One BYDAY item: `2TU` is `{ ordinal: 2, weekday: "TU" }`, `TU` has no ordinal. */
export interface ByDay {
	readonly ordinal: number | null;
	readonly weekday: Weekday;
}

/** The parsed parts of a rule; describeSchedule reads them. */
export interface RuleParts {
	/** Canonical RRULE value: uppercase, no `RRULE:` prefix, only `[A-Z0-9=;,+-]`. */
	readonly text: string;
	readonly freq: Freq;
	readonly interval: number;
	readonly byDay: readonly ByDay[];
	readonly byMonthDay: readonly number[];
	readonly byMonth: readonly number[];
	readonly bySetPos: readonly number[];
}

/** A rule validated against its series' timing. Only parseRRule mints it; ICS emits `text`. */
export type RRule = Brand<RuleParts, "RRule">;

/** Wall-clock values in SITE_TZ. All-day `last` is inclusive. */
export type EventTiming =
	| {
			readonly kind: "timed";
			readonly start: Temporal.PlainDateTime;
			readonly end: Temporal.PlainDateTime;
	  }
	| {
			readonly kind: "all-day";
			readonly first: Temporal.PlainDate;
			readonly last: Temporal.PlainDate;
	  };

/** EXDATEs are local dates; expansion places each at the series' start time. */
export interface Recurrence {
	readonly rule: RRule;
	readonly except: readonly Temporal.PlainDate[];
}

export interface EventSeries {
	readonly id: EntryId;
	readonly body: BodyId;
	readonly title: string;
	readonly location: string | null;
	readonly timing: EventTiming;
	readonly recurrence: Recurrence | null;
	readonly isStatedMeeting: boolean;
}

/** All-day occurrences run from local midnight to the local midnight after `last`. */
export interface Occurrence {
	readonly event: EntryId;
	readonly body: BodyId;
	readonly title: string;
	readonly start: Temporal.ZonedDateTime;
	readonly end: Temporal.ZonedDateTime;
	readonly allDay: boolean;
}

export function seriesStart(timing: EventTiming): Temporal.ZonedDateTime {
	return timing.kind === "timed"
		? timing.start.toZonedDateTime(SITE_TZ)
		: timing.first.toZonedDateTime(SITE_TZ);
}

export function seriesEnd(timing: EventTiming): Temporal.ZonedDateTime {
	return timing.kind === "timed"
		? timing.end.toZonedDateTime(SITE_TZ)
		: timing.last.add({ days: 1 }).toZonedDateTime(SITE_TZ);
}
