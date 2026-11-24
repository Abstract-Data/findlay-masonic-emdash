import { dateTile } from "@core/calendar/tile";
import {
	formatWeek,
	nextAfter,
	parseWeek,
	weekDays,
	weekStart,
	weekWindow,
} from "@core/calendar/week";
import { expand } from "@core/recurrence/expand";
import type { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { CHAPTER, allDay, date, entryId, instant, series, timed } from "../../fixtures";

// Monday, November 23, 2026; its week starts on Sunday the 22nd, as the month grid's rows do.
const today = date("2026-11-23");
const days = (list: readonly { readonly date: Temporal.PlainDate }[]) =>
	list.map((d) => d.date.toString());

describe("weekStart and parseWeek (home page week strip)", () => {
	it("starts every week on the Sunday the month grid starts its rows on", () => {
		expect(weekStart(date("2026-11-22")).toString()).toBe("2026-11-22");
		expect(weekStart(date("2026-11-28")).toString()).toBe("2026-11-22");
		expect(weekStart(date("2026-11-29")).toString()).toBe("2026-11-29");
	});

	it.each([
		["2026-12-09", "2026-12-06"],
		["2026-11-22", "2026-11-22"],
		["2027-01-01", "2026-12-27"],
		[null, "2026-11-22"],
		["", "2026-11-22"],
		["2026-02-30", "2026-11-22"],
		["2026-13-01", "2026-11-22"],
		["2026-1-05", "2026-11-22"],
		["1899-12-31", "2026-11-22"],
		["2200-01-01", "2026-11-22"],
		["2026-12-09T00:00", "2026-11-22"],
	])("?week=%s shows the week of %s", (raw, expected) => {
		expect(parseWeek(raw, today).toString()).toBe(expected);
	});
});

describe("weekWindow", () => {
	it("runs from local midnight on Sunday to local midnight a week on", () => {
		const window = weekWindow(date("2026-11-22"));
		expect(window.from.toString()).toBe("2026-11-22T05:00:00Z");
		expect(window.to.toString()).toBe("2026-11-29T05:00:00Z");
	});

	it("still runs midnight to midnight in the weeks the clocks change", () => {
		const before = weekWindow(date("2026-10-25"));
		expect(before.from.toString()).toBe("2026-10-25T04:00:00Z");
		expect(before.to.toString()).toBe("2026-11-01T04:00:00Z");
		const fallBack = weekWindow(date("2026-11-01"));
		expect(fallBack.from.until(fallBack.to).total("hours")).toBe(169);
		const springForward = weekWindow(date("2026-03-08"));
		expect(springForward.from.until(springForward.to).total("hours")).toBe(167);
	});
});

describe("weekDays", () => {
	const lodge = series({
		id: entryId(1),
		title: "Stated meeting",
		timing: timed("2026-09-08T19:30", "2026-09-08T21:30"),
		rrule: "FREQ=MONTHLY;BYDAY=2TU",
	});
	const closed = series({
		id: entryId(2),
		body: CHAPTER,
		title: "Temple closed",
		timing: allDay("2026-12-24", "2026-12-25"),
	});

	it("lists seven days from Sunday, each with its occurrences, and marks today", () => {
		const start = date("2026-12-06");
		const week = weekDays(start, expand([lodge, closed], weekWindow(start)), date("2026-12-08"));
		expect(days(week)).toEqual([
			"2026-12-06",
			"2026-12-07",
			"2026-12-08",
			"2026-12-09",
			"2026-12-10",
			"2026-12-11",
			"2026-12-12",
		]);
		expect(week.map((d) => d.occurrences.map((o) => o.title))).toEqual([
			[],
			[],
			["Stated meeting"],
			[],
			[],
			[],
			[],
		]);
		expect(week.filter((d) => d.isToday).map((d) => d.date.toString())).toEqual(["2026-12-08"]);
	});

	it("lists an all-day event on each day it covers", () => {
		const start = date("2026-12-20");
		const week = weekDays(start, expand([closed], weekWindow(start)), today);
		expect(week.filter((d) => d.occurrences.length > 0).map((d) => d.date.toString())).toEqual([
			"2026-12-24",
			"2026-12-25",
		]);
		expect(week.some((d) => d.isToday)).toBe(false);
	});
});

describe("formatWeek", () => {
	it("names the first and last day, and the year once", () => {
		expect(formatWeek(date("2026-11-22"))).toBe(
			"Sunday, November 22 to Saturday, November 28, 2026",
		);
	});

	it("names both years for a week across New Year", () => {
		expect(formatWeek(date("2026-12-27"))).toBe(
			"Sunday, December 27, 2026 to Saturday, January 2, 2027",
		);
	});
});

describe("nextAfter (a quiet week's next event)", () => {
	const stated = series({
		id: entryId(1),
		title: "Stated meeting",
		timing: timed("2026-09-08T19:30", "2026-09-08T21:30"),
		rrule: "FREQ=MONTHLY;BYDAY=2TU",
	});
	const breakfast = series({
		id: entryId(2),
		title: "Pancake breakfast",
		timing: timed("2026-12-05T07:00", "2026-12-05T11:00"),
	});
	const past = series({
		id: entryId(3),
		title: "Fish fry",
		timing: timed("2026-10-02T17:00", "2026-10-02T19:00"),
	});

	it("is the soonest occurrence of any series at or after the instant", () => {
		const after = instant("2026-11-29T05:00:00Z");
		expect(nextAfter([stated, breakfast, past], after)?.title).toBe("Pancake breakfast");
		const later = nextAfter([stated, past], after);
		expect(later?.start.toString()).toBe("2026-12-08T19:30:00-05:00[America/New_York]");
	});

	it("breaks a tie by title, and is null when nothing lies ahead", () => {
		const twin = series({ ...breakfast, id: entryId(4), title: "Bake sale" });
		expect(nextAfter([breakfast, twin], instant("2026-11-29T05:00:00Z"))?.title).toBe("Bake sale");
		expect(nextAfter([twin, breakfast], instant("2026-11-29T05:00:00Z"))?.title).toBe("Bake sale");
		expect(nextAfter([past], instant("2026-11-29T05:00:00Z"))).toBeNull();
		expect(nextAfter([], instant("2026-11-29T05:00:00Z"))).toBeNull();
	});
});

const at = (start: string, end: string, isAllDay = false) =>
	expand(
		[series({ timing: isAllDay ? allDay(start, end) : timed(start, end) })],
		weekWindow(weekStart(date(start.slice(0, 10)))),
	)[0];

describe("dateTile", () => {
	it("reads weekday, month and day, then the time, on any other day", () => {
		const o = at("2026-12-08T19:30", "2026-12-08T21:30");
		expect(o && dateTile(o, today)).toEqual({ above: "Tue", main: "Dec 8", time: "7:30 PM" });
	});

	it("says Tonight for a meeting from 5 PM today, and Today before then", () => {
		const evening = at("2026-11-23T17:00", "2026-11-23T19:00");
		const afternoon = at("2026-11-23T16:59", "2026-11-23T18:00");
		expect(evening && dateTile(evening, today)).toEqual({
			above: "Mon 23",
			main: "Tonight",
			time: "5:00 PM",
		});
		expect(afternoon && dateTile(afternoon, today)).toEqual({
			above: "Mon 23",
			main: "Today",
			time: "4:59 PM",
		});
	});

	it("gives an all-day occurrence no time, and Today on its day", () => {
		const o = at("2026-11-23", "2026-11-23", true);
		expect(o && dateTile(o, today)).toEqual({ above: "Mon 23", main: "Today", time: null });
		expect(o && dateTile(o, date("2026-11-22"))).toEqual({
			above: "Mon",
			main: "Nov 23",
			time: null,
		});
	});
});
