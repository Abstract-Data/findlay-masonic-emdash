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

export function isoWeekday(date: Temporal.PlainDate): IsoWeekday {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ISO calendar keeps dayOfWeek in 1..7.
	return date.dayOfWeek as IsoWeekday;
}

function monthShort(date: Temporal.PlainDate): string {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the ISO calendar keeps month in 1..12.
	return MONTH_SHORT[date.month as IsoMonth];
}

/** "7:30 PM". Fixed English, no Intl, so output is identical in every runtime. */
export function formatTime(time: { readonly hour: number; readonly minute: number }): string {
	const hour = time.hour % 12 === 0 ? 12 : time.hour % 12;
	const meridiem = time.hour < 12 ? "AM" : "PM";
	return `${hour}:${String(time.minute).padStart(2, "0")} ${meridiem}`;
}

/** "Tue, Mar 9" */
export function formatDay(date: Temporal.PlainDate): string {
	return `${WEEKDAY_SHORT[isoWeekday(date)]}, ${monthShort(date)} ${date.day}`;
}

/** "Mar 9, 2027" */
export function formatDate(date: Temporal.PlainDate): string {
	return `${monthShort(date)} ${date.day}, ${date.year}`;
}

/** RFC 5545 DATE: "20270309" */
export function toIcsDate(date: Temporal.PlainDate): string {
	return date.toString().replaceAll("-", "");
}

/** RFC 5545 local DATE-TIME: "20270309T193000" */
export function toIcsDateTime(dateTime: Temporal.PlainDateTime): string {
	return dateTime.toString({ smallestUnit: "second" }).replaceAll(/[-:]/g, "");
}
