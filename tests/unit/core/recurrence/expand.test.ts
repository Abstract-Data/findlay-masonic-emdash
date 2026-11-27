import { daysAhead, expand, monthWindow, nextOccurrences } from "@core/recurrence/expand";
import type { Occurrence } from "@core/recurrence/series";
import type { TimeWindow } from "@core/time";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { CHAPTER, allDay, entryId, instant, series, timed } from "../../fixtures";

const window = (from: string, to: string): TimeWindow => ({ from: instant(from), to: instant(to) });
const starts = (occurrences: readonly Occurrence[]) => occurrences.map((o) => o.start.toString());
const march2027 = monthWindow(Temporal.PlainYearMonth.from("2027-03"));

const statedMeeting = series({ rrule: "FREQ=MONTHLY;BYDAY=2TU" });

describe("expand (FR-4.3, 4.4)", () => {
	it("returns a one-off event inside the window with its wall-clock start and end", () => {
		const oneOff = series({ timing: timed("2027-03-20T10:00", "2027-03-20T12:00") });
		expect(expand([oneOff], march2027)).toEqual([
			{
				event: oneOff.id,
				body: oneOff.body,
				title: "Stated Meeting",
				start: Temporal.ZonedDateTime.from("2027-03-20T10:00-04:00[America/New_York]"),
				end: Temporal.ZonedDateTime.from("2027-03-20T12:00-04:00[America/New_York]"),
				allDay: false,
			},
		]);
	});

	it("leaves out a one-off event outside the window", () => {
		const oneOff = series({ timing: timed("2027-04-20T10:00", "2027-04-20T12:00") });
		expect(expand([oneOff], march2027)).toEqual([]);
	});

	it("expands a recurring event to each occurrence in the window", () => {
		const occurrences = expand(
			[statedMeeting],
			monthWindow(Temporal.PlainYearMonth.from("2027-02")),
		);
		expect(starts(occurrences)).toEqual(["2027-02-09T19:30:00-05:00[America/New_York]"]);
		expect(occurrences[0]?.end.toString()).toBe("2027-02-09T21:30:00-05:00[America/New_York]");
	});

	it("omits EXDATE occurrences and keeps the rest", () => {
		const recessed = series({ rrule: "FREQ=MONTHLY;BYDAY=2TU", except: ["2027-03-09"] });
		const quarter = window("2027-02-01T05:00:00Z", "2027-05-01T04:00:00Z");
		expect(starts(expand([recessed], quarter))).toEqual([
			"2027-02-09T19:30:00-05:00[America/New_York]",
			"2027-04-13T19:30:00-04:00[America/New_York]",
		]);
	});

	it("includes an occurrence that started before the window and runs into it", () => {
		const overnight = series({
			timing: timed("2027-01-12T22:00", "2027-01-13T02:00"),
			rrule: "FREQ=MONTHLY;BYDAY=2TU",
		});
		const afterMidnight = window("2027-03-10T05:00:00Z", "2027-03-11T05:00:00Z");
		expect(starts(expand([overnight], afterMidnight))).toEqual([
			"2027-03-09T22:00:00-05:00[America/New_York]",
		]);
	});

	it("treats the window as half-open at both edges", () => {
		const meeting = series({ timing: timed("2027-03-09T19:30", "2027-03-09T21:30") });
		expect(expand([meeting], window("2027-03-10T02:30:00Z", "2027-03-10T03:00:00Z"))).toEqual([]);
		expect(expand([meeting], window("2027-03-09T23:00:00Z", "2027-03-10T00:30:00Z"))).toEqual([]);
		expect(expand([meeting], window("2027-03-10T00:30:00Z", "2027-03-10T00:31:00Z"))).toHaveLength(
			1,
		);
	});

	it("includes a zero-length event that starts at the window's start", () => {
		const instantEvent = series({ timing: timed("2027-03-09T19:30", "2027-03-09T19:30") });
		expect(
			expand([instantEvent], window("2027-03-10T00:30:00Z", "2027-03-10T01:00:00Z")),
		).toHaveLength(1);
	});

	it("runs an all-day event from local midnight to the midnight after its last day", () => {
		const fair = series({ title: "Fair", timing: allDay("2027-06-18", "2027-06-19") });
		expect(expand([fair], monthWindow(Temporal.PlainYearMonth.from("2027-06")))).toEqual([
			expect.objectContaining({
				start: Temporal.ZonedDateTime.from("2027-06-18T00:00-04:00[America/New_York]"),
				end: Temporal.ZonedDateTime.from("2027-06-20T00:00-04:00[America/New_York]"),
				allDay: true,
			}),
		]);
	});

	it("keeps a recurring all-day occurrence on a DST date one calendar day long", () => {
		const sundays = series({ timing: allDay("2027-03-07"), rrule: "FREQ=WEEKLY" });
		const [springForward] = expand(
			[sundays],
			window("2027-03-14T05:00:00Z", "2027-03-15T04:00:00Z"),
		);
		expect(springForward?.start.toString()).toBe("2027-03-14T00:00:00-05:00[America/New_York]");
		expect(springForward?.end.toString()).toBe("2027-03-15T00:00:00-04:00[America/New_York]");
	});

	it("sorts occurrences from all series by start, then title", () => {
		const a = series({
			id: entryId(1),
			title: "Zeta",
			timing: timed("2027-03-20T10:00", "2027-03-20T11:00"),
		});
		const b = series({
			id: entryId(2),
			title: "Alpha",
			timing: timed("2027-03-20T10:00", "2027-03-20T11:00"),
		});
		const c = series({
			id: entryId(3),
			title: "Alpha",
			body: CHAPTER,
			timing: timed("2027-03-20T10:00", "2027-03-20T11:00"),
		});
		const early = series({
			id: entryId(4),
			title: "Zulu",
			timing: timed("2027-03-02T09:00", "2027-03-02T10:00"),
		});
		const titles = expand([a, b, statedMeeting, c, early], march2027).map(
			(o) => `${o.title}@${o.start.day}`,
		);
		expect(titles).toEqual(["Zulu@2", "Stated Meeting@9", "Alpha@20", "Alpha@20", "Zeta@20"]);
	});

	it("returns nothing for an empty window or no series", () => {
		expect(expand([statedMeeting], window("2027-03-10T00:30:00Z", "2027-03-10T00:30:00Z"))).toEqual(
			[],
		);
		expect(expand([], march2027)).toEqual([]);
	});
});

describe("nextOccurrences (FR-1.1, 1.2)", () => {
	it("returns the next occurrences at or after the instant, skipping EXDATEs", () => {
		const recessed = series({ rrule: "FREQ=MONTHLY;BYDAY=2TU", except: ["2027-03-09"] });
		expect(starts(nextOccurrences(recessed, instant("2027-02-10T00:30:00Z"), 3))).toEqual([
			"2027-02-09T19:30:00-05:00[America/New_York]",
			"2027-04-13T19:30:00-04:00[America/New_York]",
			"2027-05-11T19:30:00-04:00[America/New_York]",
		]);
	});

	it("starts from the first occurrence when asked before the series begins", () => {
		expect(starts(nextOccurrences(statedMeeting, instant("2026-01-01T00:00:00Z"), 1))).toEqual([
			"2027-01-12T19:30:00-05:00[America/New_York]",
		]);
	});

	it("stops when the rule ends", () => {
		const twice = series({ rrule: "FREQ=MONTHLY;BYDAY=2TU;COUNT=2" });
		expect(nextOccurrences(twice, instant("2027-01-01T00:00:00Z"), 3)).toHaveLength(2);
		expect(nextOccurrences(twice, instant("2027-03-01T00:00:00Z"), 3)).toEqual([]);
	});

	it("returns a one-off event only while it is upcoming", () => {
		const oneOff = series({ timing: timed("2027-03-20T10:00", "2027-03-20T12:00") });
		expect(nextOccurrences(oneOff, instant("2027-03-20T14:00:00Z"), 3)).toHaveLength(1);
		expect(nextOccurrences(oneOff, instant("2027-03-20T14:00:01Z"), 3)).toEqual([]);
		expect(nextOccurrences(oneOff, instant("2027-03-01T00:00:00Z"), 0)).toEqual([]);
	});

	it("returns nothing when asked for no occurrences", () => {
		expect(nextOccurrences(statedMeeting, instant("2027-01-01T00:00:00Z"), 0)).toEqual([]);
	});
});

describe("windows", () => {
	it("monthWindow spans local midnight to local midnight across a DST change", () => {
		expect(march2027).toEqual(window("2027-03-01T05:00:00Z", "2027-04-01T04:00:00Z"));
	});

	it("daysAhead runs from now to the end of the n-th local calendar day after today", () => {
		const now = instant("2027-03-01T15:00:00Z");
		expect(daysAhead(now, 13)).toEqual({ from: now, to: instant("2027-03-15T04:00:00Z") });
		expect(daysAhead(now, 0)).toEqual({ from: now, to: instant("2027-03-02T05:00:00Z") });
	});
});
