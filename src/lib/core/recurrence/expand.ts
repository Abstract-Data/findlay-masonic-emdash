import { Temporal } from "temporal-polyfill";
import { SITE_TZ, type TimeWindow } from "../time";
import { compileRule } from "./rrule";
import { seriesEnd, seriesStart, type EventSeries, type Occurrence } from "./series";

/** FR-4.3/4.4/4.6: every occurrence that overlaps the window, by start then title. */
export function expand(series: readonly EventSeries[], window: TimeWindow): Occurrence[] {
	return series.flatMap((s) => occurrencesIn(s, window)).toSorted(chronological);
}

/** FR-1.1/1.2: the next `count` occurrences starting at or after `after`. */
export function nextOccurrences(
	s: EventSeries,
	after: Temporal.Instant,
	count: number,
): Occurrence[] {
	const span = spanOf(s);
	if (s.recurrence === null) {
		const only = occurrence(s, seriesStart(s.timing), span);
		return Temporal.Instant.compare(only.start.toInstant(), after) >= 0
			? [only].slice(0, count)
			: [];
	}
	const rule = compileRule(s.recurrence.rule, s.timing, s.recurrence.except);
	const found: Occurrence[] = [];
	let cursor = after.toZonedDateTimeISO(SITE_TZ);
	let inclusive = true;
	while (found.length < count) {
		const start = rule.next(cursor, inclusive);
		if (start === null) break;
		found.push(occurrence(s, start, span));
		cursor = start;
		inclusive = false;
	}
	return found;
}

export function monthWindow(month: Temporal.PlainYearMonth): TimeWindow {
	return { from: startOfMonth(month), to: startOfMonth(month.add({ months: 1 })) };
}

/** From `now` to the end of the `days`-th calendar day after today in SITE_TZ. */
export function daysAhead(now: Temporal.Instant, days: number): TimeWindow {
	const today = now.toZonedDateTimeISO(SITE_TZ).toPlainDate();
	return {
		from: now,
		to: today
			.add({ days: days + 1 })
			.toZonedDateTime(SITE_TZ)
			.toInstant(),
	};
}

function startOfMonth(month: Temporal.PlainYearMonth): Temporal.Instant {
	return month.toPlainDate({ day: 1 }).toZonedDateTime(SITE_TZ).toInstant();
}

function occurrencesIn(s: EventSeries, window: TimeWindow): Occurrence[] {
	const span = spanOf(s);
	if (s.recurrence === null) {
		const only = occurrence(s, seriesStart(s.timing), span);
		return overlaps(only, window) ? [only] : [];
	}
	// Starting `span` early catches occurrences that began before the window and run into it.
	const from = window.from.toZonedDateTimeISO(SITE_TZ).subtract(span);
	const to = window.to.toZonedDateTimeISO(SITE_TZ);
	return compileRule(s.recurrence.rule, s.timing, s.recurrence.except)
		.between(from, to, true)
		.map((start) => occurrence(s, start, span))
		.filter((o) => overlaps(o, window));
}

// Calendar days plus exact time, so an all-day occurrence on a DST date still ends at
// the next local midnight.
function spanOf(s: EventSeries): Temporal.Duration {
	return seriesStart(s.timing).until(seriesEnd(s.timing), { largestUnit: "days" });
}

function occurrence(
	s: EventSeries,
	start: Temporal.ZonedDateTime,
	span: Temporal.Duration,
): Occurrence {
	return {
		event: s.id,
		body: s.body,
		title: s.title,
		start,
		end: start.add(span),
		allDay: s.timing.kind === "all-day",
	};
}

// A zero-length occurrence counts when it starts inside the window.
function overlaps(o: Occurrence, window: TimeWindow): boolean {
	const start = o.start.toInstant();
	return (
		Temporal.Instant.compare(start, window.to) < 0 &&
		(Temporal.Instant.compare(start, window.from) >= 0 ||
			Temporal.Instant.compare(o.end.toInstant(), window.from) > 0)
	);
}

function chronological(a: Occurrence, b: Occurrence): number {
	return Temporal.ZonedDateTime.compare(a.start, b.start) || compareText(a.title, b.title);
}

function compareText(a: string, b: string): number {
	return a < b ? -1 : Number(a > b);
}
