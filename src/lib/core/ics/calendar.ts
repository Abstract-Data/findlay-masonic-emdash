import ical, { escape, type ICalEventData } from "ical-generator";
import type { Temporal } from "temporal-polyfill";
import { tzlib_get_ical_block } from "timezones-ical-library";
import type { EntryId } from "../ids";
import type { EventSeries, EventTiming, Recurrence } from "../recurrence/series";
import { SITE_TZ, toIcsDate, toIcsDateTime } from "../time";

export interface CalendarFeed {
	readonly name: string;
	/** UIDs are `${entryId}@${uidDomain}`, stable across feed rebuilds. */
	readonly uidDomain: string;
	readonly stamp: Temporal.Instant;
	readonly series: readonly EventSeries[];
	/** Plain-text descriptions keyed by event, derived by the caller from Portable Text. */
	readonly descriptions: ReadonlyMap<EntryId, string>;
}

/** FR-4.5. Pure: the M4 endpoint wraps the result in a text/calendar Response. */
export function buildCalendar(feed: CalendarFeed): string {
	const calendar = ical({
		prodId: `//${feed.uidDomain}//calendar//EN`,
		name: calendarName(feed.name),
	});
	// The generator form keeps DTSTAMP in UTC; the plain timezone("...") form drops the Z.
	calendar.timezone({ name: null, generator: vtimezone });
	for (const series of feed.series) {
		calendar.createEvent({
			id: `${series.id}@${feed.uidDomain}`,
			stamp: feed.stamp,
			summary: series.title,
			location: series.location,
			description: feed.descriptions.get(series.id) ?? null,
			...timingData(series.timing),
			repeating: series.recurrence === null ? null : repeating(series.recurrence, series.timing),
		});
	}
	// RFC 5545 ends every content line, the last one included, with CRLF.
	return `${calendar.toString()}\r\n`;
}

// ical-generator escapes event text but writes NAME and X-WR-CALNAME verbatim, so a
// line break in a body's name would start new content lines in every subscriber's feed.
function calendarName(name: string): string {
	return escape(name.replaceAll(/\s+/g, " ").trim(), false);
}

function vtimezone(timezone: string): string | null {
	const block = tzlib_get_ical_block(timezone);
	return Array.isArray(block) ? (block[0] ?? null) : null;
}

function timingData(
	timing: EventTiming,
): Pick<ICalEventData, "start" | "end" | "allDay" | "timezone"> {
	return timing.kind === "timed"
		? { start: timing.start, end: timing.end, timezone: SITE_TZ }
		: { start: timing.first, end: timing.last.add({ days: 1 }), allDay: true };
}

// A raw string, not ical-generator's object form, which rewrites BYDAY=2TU into
// BYDAY=TU;BYSETPOS=2. RRule's charset makes the verbatim value safe.
function repeating(recurrence: Recurrence, timing: EventTiming): string {
	const exdates = recurrence.except.map((date) =>
		timing.kind === "timed"
			? `EXDATE;TZID=${SITE_TZ}:${toIcsDateTime(date.toPlainDateTime(timing.start.toPlainTime()))}`
			: `EXDATE;VALUE=DATE:${toIcsDate(date)}`,
	);
	return [`RRULE:${recurrence.rule.text}`, ...exdates].join("\n");
}
