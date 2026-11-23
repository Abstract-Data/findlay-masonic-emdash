import { expand } from "@core/recurrence/expand";
import { parseRRule } from "@core/recurrence/rrule";
import type { EventSeries } from "@core/recurrence/series";
import { describe, expect, it } from "vitest";
import { instant, series, timed, unvalidatedRule } from "../../fixtures";

/** Offset and wall time of each occurrence, e.g. "2027-03-09 19:30 -05:00". */
function local(s: EventSeries, from: string, to: string): string[] {
	return expand([s], { from: instant(from), to: instant(to) }).map(
		(o) =>
			`${o.start.toPlainDate().toString()} ${o.start.toPlainTime().toString().slice(0, 5)} ${o.start.offset}`,
	);
}

// America/New_York 2027: spring forward Sun 2027-03-14 02:00, fall back Sun 2027-11-07 02:00.
describe("DST transitions keep the intended wall-clock time (FR-4.6)", () => {
	it("weekly Tuesday 19:30 across spring-forward moves from -05:00 to -04:00", () => {
		const weekly = series({
			timing: timed("2027-03-02T19:30", "2027-03-02T21:30"),
			rrule: "FREQ=WEEKLY;BYDAY=TU",
		});
		expect(local(weekly, "2027-03-08T00:00:00Z", "2027-03-20T00:00:00Z")).toEqual([
			"2027-03-09 19:30 -05:00",
			"2027-03-16 19:30 -04:00",
		]);
	});

	it("weekly Tuesday 19:30 across fall-back moves from -04:00 to -05:00", () => {
		const weekly = series({
			timing: timed("2027-10-26T19:30", "2027-10-26T21:30"),
			rrule: "FREQ=WEEKLY;BYDAY=TU",
		});
		expect(local(weekly, "2027-11-01T00:00:00Z", "2027-11-13T00:00:00Z")).toEqual([
			"2027-11-02 19:30 -04:00",
			"2027-11-09 19:30 -05:00",
		]);
	});

	it("2nd Sunday 19:30 on the spring-forward date stays at 19:30 (-04:00)", () => {
		const monthly = series({
			timing: timed("2027-01-10T19:30", "2027-01-10T21:30"),
			rrule: "FREQ=MONTHLY;BYDAY=2SU",
		});
		expect(local(monthly, "2027-03-14T05:00:00Z", "2027-03-15T04:00:00Z")).toEqual([
			"2027-03-14 19:30 -04:00",
		]);
	});

	it("1st Sunday 19:30 on the fall-back date stays at 19:30 (-05:00)", () => {
		const monthly = series({
			timing: timed("2027-10-03T19:30", "2027-10-03T21:30"),
			rrule: "FREQ=MONTHLY;BYDAY=1SU",
		});
		expect(local(monthly, "2027-11-07T04:00:00Z", "2027-11-08T05:00:00Z")).toEqual([
			"2027-11-07 19:30 -05:00",
		]);
	});

	it("a 02:30 start is rejected, because the library omits the spring-forward occurrence", () => {
		const timing = timed("2027-03-12T02:30", "2027-03-12T03:00");
		expect(parseRRule("FREQ=DAILY;COUNT=4", timing)).toEqual({
			ok: false,
			error: { code: "dst-gap-time" },
		});
		// Measured behavior the guard exists for; RFC 5545 would emit 03:30 on 2027-03-14.
		const unguarded = unvalidatedRule({
			text: "FREQ=DAILY;COUNT=4",
			freq: "DAILY",
			interval: 1,
			byDay: [],
			byMonthDay: [],
			byMonth: [],
			bySetPos: [],
		});
		const daily = { ...series({ timing }), recurrence: { rule: unguarded, except: [] } };
		expect(local(daily, "2027-03-12T00:00:00Z", "2027-03-17T00:00:00Z")).toEqual([
			"2027-03-12 02:30 -05:00",
			"2027-03-13 02:30 -05:00",
			"2027-03-15 02:30 -04:00",
			"2027-03-16 02:30 -04:00",
		]);
	});

	it("daily 01:30 on the fall-back date takes the earlier (-04:00) of the repeated hour", () => {
		const daily = series({
			timing: timed("2027-11-05T01:30", "2027-11-05T01:45"),
			rrule: "FREQ=DAILY;COUNT=4",
		});
		expect(local(daily, "2027-11-07T04:00:00Z", "2027-11-08T05:00:00Z")).toEqual([
			"2027-11-07 01:30 -04:00",
		]);
	});
});
