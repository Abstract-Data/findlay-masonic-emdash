import type { Temporal } from "temporal-polyfill";

export const SITE_TZ = "America/New_York";

/** Half-open: `from` is inside the window, `to` is not. */
export interface TimeWindow {
	readonly from: Temporal.Instant;
	readonly to: Temporal.Instant;
}

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type IsoMonth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

const WEEKDAY_SHORT: Record<IsoWeekday, string> = {
	1: "Mon",
	2: "Tue",
	3: "Wed",
	4: "Thu",
	5: "Fri",
	6: "Sat",
	7: "Sun",
};

const MONTH_SHORT: Record<IsoMonth, string> = {
	1: "Jan",
	2: "Feb",
	3: "Mar",
	4: "Apr",
	5: "May",
	6: "Jun",
	7: "Jul",
	8: "Aug",
	9: "Sep",
	10: "Oct",
	11: "Nov",
	12: "Dec",
};

const WEEKDAY_LONG: Record<IsoWeekday, string> = {
	1: "Monday",
	2: "Tuesday",
	3: "Wednesday",
	4: "Thursday",
	5: "Friday",
	6: "Saturday",
	7: "Sunday",
};

const MONTH_LONG: Record<IsoMonth, string> = {
	1: "January",
	2: "February",
	3: "March",
	4: "April",
	5: "May",
	6: "June",
	7: "July",
	8: "August",
	9: "September",
	10: "October",
	11: "November",
	12: "December",
};

function isoMonth(value: { readonly month: number }): IsoMonth {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ISO calendar keeps month in 1..12.
	return value.month as IsoMonth;
}

/** "Tuesday, December 8" */
export function formatLongDay(date: Temporal.PlainDate): string {
	return `${WEEKDAY_LONG[isoWeekday(date)]}, ${MONTH_LONG[isoMonth(date)]} ${date.day}`;
}

/** "December 2026" */
export function formatMonth(month: Temporal.PlainYearMonth): string {
	return `${MONTH_LONG[isoMonth(month)]} ${month.year}`;
}

export function isoWeekday(date: Temporal.PlainDate): IsoWeekday {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ISO calendar keeps dayOfWeek in 1..7.
	return date.dayOfWeek as IsoWeekday;
}

/** "Tue" */
export function formatWeekday(date: Temporal.PlainDate): string {
	return WEEKDAY_SHORT[isoWeekday(date)];
}

/** "Mar 9" */
export function formatMonthDay(date: Temporal.PlainDate): string {
	return `${MONTH_SHORT[isoMonth(date)]} ${date.day}`;
}

/** "7:30 PM". Fixed English, no Intl, so output is identical in every runtime. */
export function formatTime(time: { readonly hour: number; readonly minute: number }): string {
	const hour = time.hour % 12 === 0 ? 12 : time.hour % 12;
	const meridiem = time.hour < 12 ? "AM" : "PM";
	return `${hour}:${String(time.minute).padStart(2, "0")} ${meridiem}`;
}

/** "Tue, Mar 9" */
export function formatDay(date: Temporal.PlainDate): string {
	return `${formatWeekday(date)}, ${formatMonthDay(date)}`;
}

/** "Mar 9, 2027" */
export function formatDate(date: Temporal.PlainDate): string {
	return `${formatMonthDay(date)}, ${date.year}`;
}

/**
 * Whole seconds from `now` to the next local midnight in SITE_TZ, when "today" moves on. Rounded
 * down, so `now` plus the result never passes midnight.
 */
export function secondsToMidnight(now: Temporal.Instant): number {
	const tomorrow = now.toZonedDateTimeISO(SITE_TZ).toPlainDate().add({ days: 1 });
	const midnight = tomorrow.toZonedDateTime(SITE_TZ).epochMilliseconds;
	return Math.floor((midnight - now.epochMilliseconds) / 1000);
}

/** RFC 5545 DATE: "20270309" */
export function toIcsDate(date: Temporal.PlainDate): string {
	return date.toString().replaceAll("-", "");
}

/** RFC 5545 local DATE-TIME: "20270309T193000" */
export function toIcsDateTime(dateTime: Temporal.PlainDateTime): string {
	return dateTime.toString({ smallestUnit: "second" }).replaceAll(/[-:]/g, "");
}
