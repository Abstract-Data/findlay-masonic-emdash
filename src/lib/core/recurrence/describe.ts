import type { Temporal } from "temporal-polyfill";
import { toText } from "rrule-temporal/totext";
import { formatDay, formatTime, isoWeekday, type IsoWeekday } from "../time";
import { compileRule } from "./rrule";
import type { ByDay, EventSeries, EventTiming, Occurrence, RRule, Weekday } from "./series";

export type BodySchedule =
	| { readonly kind: "rule"; readonly text: string; readonly note: string | null }
	| { readonly kind: "note"; readonly note: string }
	| { readonly kind: "contact-secretary" };

const WEEKDAY_OF: Record<IsoWeekday, Weekday> = {
	1: "MO",
	2: "TU",
	3: "WE",
	4: "TH",
	5: "FR",
	6: "SA",
	7: "SU",
};

const WEEKDAY_NAME: Record<Weekday, string> = {
	MO: "Monday",
	TU: "Tuesday",
	WE: "Wednesday",
	TH: "Thursday",
	FR: "Friday",
	SA: "Saturday",
	SU: "Sunday",
};

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

const EVERY = new Map([
	[1, "Every"],
	[2, "Every other"],
]);

const POSITION = new Map<number | null, string>([
	[1, "1st"],
	[2, "2nd"],
	[3, "3rd"],
	[4, "4th"],
	[5, "5th"],
	[-1, "last"],
	// rrule-temporal's toText renders -2TU as "last Tuesday", so every ordinal is named here.
	[-2, "2nd-to-last"],
	[-3, "3rd-to-last"],
	[-4, "4th-to-last"],
	[-5, "5th-to-last"],
]);

const DAY_SUFFIX = new Map([
	[1, "st"],
	[2, "nd"],
	[3, "rd"],
]);

// A body page lists the schedule of a lodge that recesses for up to four months.
const MAX_RECESS_MONTHS = 4;

/**
 * FR-1.3: "2nd Tuesday of each month, 7:30 PM". Shapes it cannot phrase fall back to
 * rrule-temporal's English text, sentence-cased.
 */
export function describeSchedule(rule: RRule, timing: EventTiming): string {
	const start = timing.kind === "timed" ? timing.start.toPlainDate() : timing.first;
	const pattern = describePattern(rule, start);
	if (pattern === null) {
		return capitalize(toText(compileRule(rule, timing, []), "en", { excludeTzAbbreviation: true }));
	}
	return timing.kind === "timed" ? `${pattern}, ${formatTime(timing.start)}` : pattern;
}

/** FR-1.3/1.4: the stated meeting's rule, else the note, else the secretary message. */
export function bodySchedule(stated: EventSeries | null, note: string | null): BodySchedule {
	if (stated !== null && stated.recurrence !== null) {
		return { kind: "rule", text: describeSchedule(stated.recurrence.rule, stated.timing), note };
	}
	return note === null ? { kind: "contact-secretary" } : { kind: "note", note };
}

/** "Tue, Mar 9, 7:30 PM", or "Sat, Jun 19" for all-day. Fixed English, no Intl. */
export function formatOccurrence(o: Occurrence): string {
	const day = formatDay(o.start.toPlainDate());
	return o.allDay ? day : `${day}, ${formatTime(o.start)}`;
}

function describePattern(rule: RRule, start: Temporal.PlainDate): string | null {
	const cadence =
		rule.freq === "WEEKLY"
			? weekly(rule, start)
			: rule.freq === "MONTHLY"
				? monthly(rule, start)
				: null;
	const except = recess(rule.byMonth);
	return cadence === null || except === null ? null : `${cadence}${except}`;
}

function weekly(rule: RRule, start: Temporal.PlainDate): string | null {
	const every = EVERY.get(rule.interval);
	// rrule-temporal's strict mode already rejects BYMONTHDAY with WEEKLY.
	if (every === undefined || rule.bySetPos.length > 0) return null;
	const days =
		rule.byDay.length > 0 ? rule.byDay.map((d) => d.weekday) : [WEEKDAY_OF[isoWeekday(start)]];
	return `${every} ${joinAnd(days.map((d) => WEEKDAY_NAME[d]))}`;
}

function monthly(rule: RRule, start: Temporal.PlainDate): string | null {
	if (rule.interval !== 1) return null;
	if (rule.byDay.length > 0) {
		return rule.byMonthDay.length > 0 ? null : monthWeekdays(rule.byDay, rule.bySetPos);
	}
	if (rule.bySetPos.length > 0) return null;
	const days = rule.byMonthDay.length > 0 ? rule.byMonthDay : [start.day];
	return days.every((day) => day > 0) ? `${joinAnd(days.map(ordinal))} of each month` : null;
}

function monthWeekdays(byDay: readonly ByDay[], bySetPos: readonly number[]): string | null {
	const ordinals = byDay.map((d) => d.ordinal);
	const positions =
		bySetPos.length === 0 ? ordinals : ordinals.every((o) => o === null) ? bySetPos : [];
	const words = positions.flatMap((p) => POSITION.get(p) ?? []);
	const weekdays = [...new Set(byDay.map((d) => WEEKDAY_NAME[d.weekday]))];
	if (weekdays.length !== 1 || positions.length === 0 || words.length !== positions.length) {
		return null;
	}
	return `${capitalize(joinAnd(words))} ${joinAnd(weekdays)} of each month`;
}

function recess(byMonth: readonly number[]): string | null {
	const skipped = MONTH_NAMES.filter((_, i) => byMonth.length > 0 && !byMonth.includes(i + 1));
	if (skipped.length === 0) return "";
	return skipped.length <= MAX_RECESS_MONTHS ? ` except ${joinAnd(skipped)}` : null;
}

function ordinal(day: number): string {
	const teen = day >= 11 && day <= 13;
	return `${day}${teen ? "th" : (DAY_SUFFIX.get(day % 10) ?? "th")}`;
}

function joinAnd(items: readonly string[]): string {
	const head = items.slice(0, -1);
	const last = items.slice(-1).join("");
	return head.length === 0 ? last : `${head.join(", ")} and ${last}`;
}

function capitalize(text: string): string {
	return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
