import { Temporal } from "temporal-polyfill";
import type { Occurrence } from "../recurrence/series";
import { formatTime, isoWeekday } from "../time";

export interface CalendarDay {
	readonly date: Temporal.PlainDate;
	readonly isToday: boolean;
	readonly occurrences: readonly Occurrence[];
}

/** Seven cells, Sunday first. `null` pads the days outside the month. */
export type Week = readonly (CalendarDay | null)[];

export interface MonthGrid {
	readonly month: Temporal.PlainYearMonth;
	readonly weeks: readonly Week[];
}

export interface AgendaDay {
	readonly date: Temporal.PlainDate;
	readonly occurrences: readonly Occurrence[];
}

const MONTH_PARAM = /^(\d{4})-(\d{2})$/;
const FIRST_YEAR = 1900;
const LAST_YEAR = 2199;
const DAYS_IN_WEEK = 7;

/** `?month=2026-12`; anything else, or a year far outside the site's life, is this month. */
export function parseMonth(raw: string | null, today: Temporal.PlainDate): Temporal.PlainYearMonth {
	const match = MONTH_PARAM.exec(raw ?? "");
	const year = Number(match?.[1]);
	const month = Number(match?.[2]);
	if (match === null || year < FIRST_YEAR || year > LAST_YEAR || month < 1 || month > 12) {
		return today.toPlainYearMonth();
	}
	return Temporal.PlainYearMonth.from({ year, month });
}

/**
 * The local days an occurrence is listed on. A timed occurrence is listed on the day it
 * starts, even when it runs past midnight; an all-day one on every day it covers.
 */
export function listedDays(o: Occurrence): Temporal.PlainDate[] {
	const first = o.start.toPlainDate();
	if (!o.allDay) return [first];
	const last = o.end.subtract({ days: 1 }).toPlainDate();
	const days: Temporal.PlainDate[] = [];
	for (let day = first; Temporal.PlainDate.compare(day, last) <= 0; day = day.add({ days: 1 })) {
		days.push(day);
	}
	return days;
}

/** FR-4.3, 4.4: the month as Sunday-first weeks, each day with the occurrences listed on it. */
export function monthGrid(
	month: Temporal.PlainYearMonth,
	occurrences: readonly Occurrence[],
	today: Temporal.PlainDate,
): MonthGrid {
	const byDay = listedByDay(occurrences);
	const days: CalendarDay[] = Array.from({ length: month.daysInMonth }, (_, i) => {
		const date = month.toPlainDate({ day: i + 1 });
		return {
			date,
			isToday: date.equals(today),
			occurrences: byDay.get(date.toString()) ?? [],
		};
	});
	const lead = isoWeekday(month.toPlainDate({ day: 1 })) % DAYS_IN_WEEK;
	const cells: (CalendarDay | null)[] = [...Array.from({ length: lead }, () => null), ...days];
	const trail = (DAYS_IN_WEEK - (cells.length % DAYS_IN_WEEK)) % DAYS_IN_WEEK;
	cells.push(...Array.from({ length: trail }, () => null));
	const weeks: Week[] = [];
	for (let i = 0; i < cells.length; i += DAYS_IN_WEEK) {
		weeks.push(cells.slice(i, i + DAYS_IN_WEEK));
	}
	return { month, weeks };
}

/**
 * Each occurrence once, under the first day it is listed on from `from` up to `until`
 * (exclusive), in the order given. Days with nothing are left out.
 */
export function agenda(
	occurrences: readonly Occurrence[],
	from: Temporal.PlainDate,
	until: Temporal.PlainDate,
): AgendaDay[] {
	const groups = new Map<string, { date: Temporal.PlainDate; occurrences: Occurrence[] }>();
	for (const o of occurrences) {
		const date = listedDays(o).find(
			(day) =>
				Temporal.PlainDate.compare(day, from) >= 0 && Temporal.PlainDate.compare(day, until) < 0,
		);
		if (date === undefined) continue;
		const key = date.toString();
		const group = groups.get(key) ?? { date, occurrences: [] };
		group.occurrences.push(o);
		groups.set(key, group);
	}
	return [...groups.values()].toSorted((a, b) => Temporal.PlainDate.compare(a.date, b.date));
}

/** "7:30 PM", or "All day". */
export function timeLabel(o: Occurrence): string {
	return o.allDay ? "All day" : formatTime(o.start);
}

/** The value of a `<time datetime>`: a local date, or a date and time with its offset. */
export function datetimeOf(o: Occurrence): string {
	return o.allDay
		? o.start.toPlainDate().toString()
		: o.start.toString({ smallestUnit: "minute", timeZoneName: "never" });
}

function listedByDay(occurrences: readonly Occurrence[]): Map<string, Occurrence[]> {
	const byDay = new Map<string, Occurrence[]>();
	for (const o of occurrences) {
		for (const day of listedDays(o)) {
			const key = day.toString();
			byDay.set(key, [...(byDay.get(key) ?? []), o]);
		}
	}
	return byDay;
}
