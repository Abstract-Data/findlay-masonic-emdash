import type { Temporal } from "temporal-polyfill";
import type { Occurrence } from "../recurrence/series";
import { formatMonthDay, formatTime, formatWeekday } from "../time";

/**
 * A meeting's date tile, read top to bottom: "Tue / Dec 8 / 7:30 PM", and on the day itself
 * "Mon 23 / Tonight / 7:30 PM". The words depend on today, so a page showing one expires at
 * local midnight.
 */
export interface DateTile {
	readonly above: string;
	readonly main: string;
	/** Null for an all-day occurrence. */
	readonly time: string | null;
}

// A meeting that starts at 5 PM or later is "Tonight" on its day.
const EVENING_HOUR = 17;

export function dateTile(o: Occurrence, today: Temporal.PlainDate): DateTile {
	const date = o.start.toPlainDate();
	const time = o.allDay ? null : formatTime(o.start);
	if (!date.equals(today)) {
		return { above: formatWeekday(date), main: formatMonthDay(date), time };
	}
	const evening = !o.allDay && o.start.hour >= EVENING_HOUR;
	return { above: `${formatWeekday(date)} ${date.day}`, main: evening ? "Tonight" : "Today", time };
}
