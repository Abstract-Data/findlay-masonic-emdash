import { systemClock } from "@adapters/clock";
import { buildCalendar } from "@core/ics/calendar";
import type { Calendar } from "./content";

/** FR-4.5: a calendar's events as an ICS feed. UIDs are stable per host across rebuilds. */
export function calendarResponse(
	name: string,
	calendar: Calendar,
	url: URL,
	filename: string,
): Response {
	const ics = buildCalendar({
		name,
		uidDomain: url.hostname,
		stamp: systemClock.now(),
		series: calendar.series,
		descriptions: calendar.descriptions,
	});
	return new Response(ics, {
		headers: {
			"content-type": "text/calendar; charset=utf-8",
			"content-disposition": `inline; filename="${filename}"`,
		},
	});
}
