import {
	agenda,
	datetimeOf,
	listedDays,
	monthGrid,
	parseMonth,
	timeLabel,
} from "@core/calendar/month";
import { expand, monthWindow } from "@core/recurrence/expand";
import { formatLongDay, formatMonth } from "@core/time";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { allDay, date, entryId, series, timed } from "../../fixtures";

const december = Temporal.PlainYearMonth.from("2026-12");
const today = date("2026-11-23");
const days = (list: readonly Temporal.PlainDate[]) => list.map((d) => d.toString());
// The lodge's stated meeting series begins on its 2nd Tuesday in September 2026.
const SEPTEMBER = timed("2026-09-08T19:30", "2026-09-08T21:30");

describe("parseMonth (FR-4.3, 4.4)", () => {
	it.each([
		["2027-02", "2027-02"],
		[null, "2026-11"],
		["", "2026-11"],
		["2027-13", "2026-11"],
		["2027-00", "2026-11"],
		["2027-2", "2026-11"],
		["1899-12", "2026-11"],
		["2200-01", "2026-11"],
		["2027-02-01", "2026-11"],
	])("%s is %s", (raw, expected) => {
		expect(parseMonth(raw, today).toString()).toBe(expected);
	});
});

describe("monthGrid (FR-4.3, 4.4)", () => {
	it("lays the month out in Sunday-first weeks, padded outside the month", () => {
		const grid = monthGrid(december, [], today);
		// December 1, 2026 is a Tuesday; the 31st a Thursday.
		expect(grid.weeks).toHaveLength(5);
		expect(grid.weeks[0]?.map((day) => day?.date.day ?? null)).toEqual([null, null, 1, 2, 3, 4, 5]);
		expect(grid.weeks[4]?.map((day) => day?.date.day ?? null)).toEqual([
			27,
			28,
			29,
			30,
			31,
			null,
			null,
		]);
		expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
	});

	it("needs no padding for a month that starts on Sunday and fills four weeks", () => {
		const grid = monthGrid(Temporal.PlainYearMonth.from("2026-02"), [], today);
		expect(grid.weeks).toHaveLength(4);
		expect(grid.weeks.flat().every((day) => day !== null)).toBe(true);
	});

	it("puts each occurrence on its day and marks today", () => {
		const meeting = series({ rrule: "FREQ=MONTHLY;BYDAY=2TU", timing: SEPTEMBER });
		const grid = monthGrid(december, expand([meeting], monthWindow(december)), date("2026-12-08"));
		const cells = grid.weeks.flat().filter((day) => day !== null);
		const busy = cells.filter((day) => day.occurrences.length > 0);
		expect(busy.map((day) => day.date.toString())).toEqual(["2026-12-08"]);
		expect(cells.filter((day) => day.isToday).map((day) => day.date.toString())).toEqual([
			"2026-12-08",
		]);
	});

	it("lists an all-day event on every day it covers inside the month", () => {
		const fair = series({ title: "Fair", timing: allDay("2026-11-30", "2026-12-02") });
		const grid = monthGrid(december, expand([fair], monthWindow(december)), today);
		const busy = grid.weeks
			.flat()
			.filter((day) => day !== null && day.occurrences.length > 0)
			.map((day) => day?.date.toString());
		expect(busy).toEqual(["2026-12-01", "2026-12-02"]);
	});
});

describe("listedDays", () => {
	it("lists a timed occurrence on its start day even when it runs past midnight", () => {
		const [late] = expand(
			[series({ timing: timed("2026-12-04T21:00", "2026-12-05T01:00") })],
			monthWindow(december),
		);
		expect(late && days(listedDays(late))).toEqual(["2026-12-04"]);
	});

	it("lists an all-day occurrence on each of its days", () => {
		const [fair] = expand(
			[series({ timing: allDay("2026-12-04", "2026-12-06") })],
			monthWindow(december),
		);
		expect(fair && days(listedDays(fair))).toEqual(["2026-12-04", "2026-12-05", "2026-12-06"]);
	});
});

describe("agenda", () => {
	const lodge = series({ rrule: "FREQ=MONTHLY;BYDAY=2TU", timing: SEPTEMBER });
	const fair = series({
		id: entryId(2),
		title: "Fair",
		timing: allDay("2026-11-30", "2026-12-02"),
	});
	const occurrences = expand([fair, lodge], monthWindow(december));

	it("lists each occurrence once, under its first day inside the range", () => {
		const list = agenda(occurrences, date("2026-12-01"), date("2027-01-01"));
		expect(list.map((day) => [day.date.toString(), day.occurrences.map((o) => o.title)])).toEqual([
			["2026-12-01", ["Fair"]],
			["2026-12-08", ["Stated Meeting"]],
		]);
	});

	it("leaves out what falls outside the range, and is empty when nothing is left", () => {
		expect(agenda(occurrences, date("2026-12-03"), date("2026-12-08"))).toEqual([]);
	});

	it("groups occurrences on the same day in the order given", () => {
		const supper = series({
			id: entryId(3),
			title: "Supper",
			timing: timed("2026-12-08T18:00", "2026-12-08T19:00"),
		});
		const list = agenda(
			expand([lodge, supper], monthWindow(december)),
			date("2026-12-08"),
			date("2026-12-09"),
		);
		expect(list).toHaveLength(1);
		expect(list[0]?.occurrences.map((o) => o.title)).toEqual(["Supper", "Stated Meeting"]);
	});
});

describe("occurrence labels", () => {
	const [meeting] = expand(
		[series({ rrule: "FREQ=MONTHLY;BYDAY=2TU", timing: SEPTEMBER })],
		monthWindow(december),
	);
	const [fair] = expand([series({ timing: allDay("2026-12-19") })], monthWindow(december));

	it("gives a time or 'All day'", () => {
		expect(meeting && timeLabel(meeting)).toBe("7:30 PM");
		expect(fair && timeLabel(fair)).toBe("All day");
	});

	it("gives <time datetime> a date-time with its offset, or a date", () => {
		expect(meeting && datetimeOf(meeting)).toBe("2026-12-08T19:30-05:00");
		expect(fair && datetimeOf(fair)).toBe("2026-12-19");
	});

	it("names days and months in full", () => {
		expect(formatLongDay(date("2026-12-08"))).toBe("Tuesday, December 8");
		expect(formatMonth(december)).toBe("December 2026");
	});
});
