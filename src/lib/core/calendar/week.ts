import { Temporal } from "temporal-polyfill";
import { nextOccurrences } from "../recurrence/expand";
import type { EventSeries, Occurrence } from "../recurrence/series";
import { SITE_TZ, formatLongDay, isoWeekday, type TimeWindow } from "../time";
import { FIRST_YEAR, LAST_YEAR, listedByDay, type CalendarDay } from "./month";

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN_WEEK = 7;

/** The Sunday that starts the week holding `date`, as the month grid's rows start. */
export function weekStart(date: Temporal.PlainDate): Temporal.PlainDate {
	return date.subtract({ days: isoWeekday(date) % DAYS_IN_WEEK });
}

/**
 * `?week=2026-11-22`: the week holding that date. Anything else, or a year far outside the
 * site's life, is this week.
 */
export function parseWeek(raw: string | null, today: Temporal.PlainDate): Temporal.PlainDate {
	const date = raw !== null && DATE_PARAM.test(raw) ? plainDate(raw) : null;
	const known = date !== null && date.year >= FIRST_YEAR && date.year <= LAST_YEAR;
	return weekStart(known ? date : today);
}

/** From local midnight on the week's first day to local midnight seven days on. */
export function weekWindow(start: Temporal.PlainDate): TimeWindow {
	return {
		from: start.toZonedDateTime(SITE_TZ).toInstant(),
		to: start.add({ days: DAYS_IN_WEEK }).toZonedDateTime(SITE_TZ).toInstant(),
	};
}

/** The week's seven days from `start`, each with the occurrences listed on it. */
export function weekDays(
	start: Temporal.PlainDate,
	occurrences: readonly Occurrence[],
	today: Temporal.PlainDate,
): CalendarDay[] {
	const byDay = listedByDay(occurrences);
	return Array.from({ length: DAYS_IN_WEEK }, (_, i) => {
		const date = start.add({ days: i });
		return { date, isToday: date.equals(today), occurrences: byDay.get(date.toString()) ?? [] };
	});
}

/** "Sunday, November 22 to Saturday, November 28, 2026"; a week across New Year names both years. */
export function formatWeek(start: Temporal.PlainDate): string {
	const end = start.add({ days: DAYS_IN_WEEK - 1 });
	const first =
		start.year === end.year ? formatLongDay(start) : `${formatLongDay(start)}, ${start.year}`;
	return `${first} to ${formatLongDay(end)}, ${end.year}`;
}

/** The soonest occurrence starting at or after `after`, for a quiet week's "next" line. */
export function nextAfter(
	series: readonly EventSeries[],
	after: Temporal.Instant,
): Occurrence | null {
	return (
		series
			.flatMap((s) => nextOccurrences(s, after, 1))
			.toSorted(
				(a, b) =>
					Temporal.ZonedDateTime.compare(a.start, b.start) ||
					(a.title < b.title ? -1 : Number(a.title > b.title)),
			)[0] ?? null
	);
}

function plainDate(raw: string): Temporal.PlainDate | null {
	try {
		return Temporal.PlainDate.from(raw, { overflow: "reject" });
	} catch {
		return null;
	}
}
