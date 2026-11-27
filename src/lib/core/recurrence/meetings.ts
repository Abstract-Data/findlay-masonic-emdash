import { Temporal } from "temporal-polyfill";
import type { BodyId } from "../ids";
import { bodySchedule, type BodySchedule } from "./describe";
import { nextOccurrences } from "./expand";
import type { EventSeries, Occurrence } from "./series";

export interface Meetings {
	readonly schedule: BodySchedule;
	/** The next stated meetings, soonest first. */
	readonly next: readonly Occurrence[];
}

/**
 * FR-1.1, 1.3, 1.4 for one body's events. The schedule comes from the recurring stated meeting
 * that meets soonest, so a rule that has ended (UNTIL or COUNT run out) no longer names it.
 */
export function meetings(
	series: readonly EventSeries[],
	note: string | null,
	now: Temporal.Instant,
	count: number,
): Meetings {
	const stated = series
		.filter((s) => s.isStatedMeeting)
		.map((s) => ({ series: s, next: nextOccurrences(s, now, count) }));
	const next = stated
		.flatMap((s) => s.next)
		.toSorted(soonest)
		.slice(0, count);
	const ruling = stated
		.filter((s) => s.series.recurrence !== null)
		.flatMap((s) => (s.next[0] === undefined ? [] : [{ series: s.series, first: s.next[0] }]))
		.toSorted((a, b) => soonest(a.first, b.first))[0];
	return { schedule: bodySchedule(ruling?.series ?? null, note), next };
}

/** FR-1.2: each body with its own meetings, in the order given. */
export function meetingsByBody<
	B extends { readonly id: BodyId; readonly scheduleNote: string | null },
>(
	bodies: readonly B[],
	series: readonly EventSeries[],
	now: Temporal.Instant,
	count: number,
): { readonly body: B; readonly meetings: Meetings }[] {
	return bodies.map((body) => ({
		body,
		meetings: meetings(
			series.filter((s) => s.body === body.id),
			body.scheduleNote,
			now,
			count,
		),
	}));
}

function soonest(a: Occurrence, b: Occurrence): number {
	return Temporal.ZonedDateTime.compare(a.start, b.start);
}
