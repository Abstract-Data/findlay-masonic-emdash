import { bodySchedule, describeSchedule, formatOccurrence } from "@core/recurrence/describe";
import { expand } from "@core/recurrence/expand";
import type { EventTiming } from "@core/recurrence/series";
import { describe, expect, it } from "vitest";
import { allDay, instant, rule, series, timed } from "../../fixtures";

const tuesday = timed("2027-01-12T19:30", "2027-01-12T21:30");
const describeRule = (text: string, timing: EventTiming = tuesday) =>
	describeSchedule(rule(text, timing), timing);

describe("describeSchedule (FR-1.3)", () => {
	it.each([
		["FREQ=MONTHLY;BYDAY=2TU", "2nd Tuesday of each month, 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2", "2nd Tuesday of each month, 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=-1TH", "Last Thursday of each month, 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=1MO,3MO", "1st and 3rd Monday of each month, 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=1MO,3MO,5MO", "1st, 3rd and 5th Monday of each month, 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=-2TU", "2nd-to-last Tuesday of each month, 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=WE;BYSETPOS=1,-1", "1st and last Wednesday of each month, 7:30 PM"],
		["FREQ=WEEKLY;BYDAY=TU", "Every Tuesday, 7:30 PM"],
		["FREQ=WEEKLY;INTERVAL=2;BYDAY=TU", "Every other Tuesday, 7:30 PM"],
		["FREQ=WEEKLY;BYDAY=TU,TH", "Every Tuesday and Thursday, 7:30 PM"],
		["FREQ=WEEKLY", "Every Tuesday, 7:30 PM"],
		["FREQ=MONTHLY;BYMONTHDAY=15", "15th of each month, 7:30 PM"],
		["FREQ=MONTHLY", "12th of each month, 7:30 PM"],
		[
			"FREQ=MONTHLY;BYMONTHDAY=1,2,3,4,11,12,13,22",
			"1st, 2nd, 3rd, 4th, 11th, 12th, 13th and 22nd of each month, 7:30 PM",
		],
	])("%s reads as %s", (text, expected) => {
		expect(describeRule(text)).toBe(expected);
	});

	it("names up to four recess months", () => {
		expect(describeRule("FREQ=MONTHLY;BYDAY=2TU;BYMONTH=1,2,3,4,5,6,9,10,11,12")).toBe(
			"2nd Tuesday of each month except July and August, 7:30 PM",
		);
		expect(describeRule("FREQ=WEEKLY;BYDAY=TU;BYMONTH=1,2,3,4,5,6,7,8")).toBe(
			"Every Tuesday except September, October, November and December, 7:30 PM",
		);
		expect(describeRule("FREQ=MONTHLY;BYDAY=2TU;BYMONTH=1,2,3,4,5,6,7,8,9,10,11,12")).toBe(
			"2nd Tuesday of each month, 7:30 PM",
		);
	});

	it("drops the time for an all-day series", () => {
		const saturday = allDay("2027-01-09");
		expect(describeRule("FREQ=MONTHLY;BYDAY=2SA", saturday)).toBe("2nd Saturday of each month");
		expect(describeRule("FREQ=YEARLY;BYMONTH=6;BYDAY=3SA", saturday)).toBe(
			"Every year on 3rd Saturday in June",
		);
	});

	it.each([
		["FREQ=DAILY;INTERVAL=3", "Every 3 days at 7:30 PM"],
		["FREQ=YEARLY;BYMONTH=6;BYDAY=3SA", "Every year on 3rd Saturday in June at 7:30 PM"],
		["FREQ=WEEKLY;INTERVAL=3;BYDAY=TU", "Every 3 weeks on Tuesday at 7:30 PM"],
		[
			"FREQ=WEEKLY;BYDAY=TU,TH;BYSETPOS=1",
			"Every week on Tuesday and Thursday at 7:30 PM on the 1st instance",
		],
		["FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU", "Every 2 months on 2nd Tuesday at 7:30 PM"],
		[
			"FREQ=MONTHLY;BYDAY=2TU;BYMONTHDAY=8,9,10,11,12,13,14",
			"Every month on 2nd Tuesday on the 8th, 9th, 10th, 11th, 12th, 13th and 14th day of the month at 7:30 PM",
		],
		[
			"FREQ=MONTHLY;BYMONTHDAY=12,13;BYSETPOS=1",
			"Every month on the 12th and 13th day of the month at 7:30 PM on the 1st instance",
		],
		["FREQ=MONTHLY;BYMONTHDAY=-1", "Every month on the last day of the month at 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=1MO,3TU", "Every month on 1st Monday and 3rd Tuesday at 7:30 PM"],
		["FREQ=MONTHLY;BYDAY=TU", "Every month on Tuesday at 7:30 PM"],
		[
			"FREQ=MONTHLY;BYDAY=2TU;BYSETPOS=1",
			"Every month on 2nd Tuesday at 7:30 PM on the 1st instance",
		],
		[
			"FREQ=MONTHLY;BYDAY=2TU;BYMONTH=1,2,3",
			"Every month on 2nd Tuesday in January, February and March at 7:30 PM",
		],
	])("falls back to rrule-temporal's text for %s", (text, expected) => {
		expect(describeRule(text)).toBe(expected);
	});
});

describe("bodySchedule (FR-1.3, 1.4)", () => {
	const stated = series({ isStatedMeeting: true, rrule: "FREQ=MONTHLY;BYDAY=2TU" });

	it("derives the schedule from the stated meeting and keeps the note", () => {
		expect(bodySchedule(stated, "Dark in July and August.")).toEqual({
			kind: "rule",
			text: "2nd Tuesday of each month, 7:30 PM",
			note: "Dark in July and August.",
		});
		expect(bodySchedule(stated, null)).toEqual({
			kind: "rule",
			text: "2nd Tuesday of each month, 7:30 PM",
			note: null,
		});
	});

	it("shows the note when there is no recurring stated meeting", () => {
		expect(bodySchedule(null, "Meets on call.")).toEqual({ kind: "note", note: "Meets on call." });
		expect(bodySchedule(series({ isStatedMeeting: true }), "Meets on call.")).toEqual({
			kind: "note",
			note: "Meets on call.",
		});
	});

	it("falls back to contacting the secretary with neither", () => {
		expect(bodySchedule(null, null)).toEqual({ kind: "contact-secretary" });
	});
});

const firstOccurrence = (start: string, end: string) =>
	expand([series({ timing: timed(start, end) })], {
		from: instant("2027-01-01T00:00:00Z"),
		to: instant("2028-01-01T00:00:00Z"),
	})[0];

describe("formatOccurrence", () => {
	it.each([
		["2027-03-09T19:30", "Tue, Mar 9, 7:30 PM"],
		["2027-06-19T12:00", "Sat, Jun 19, 12:00 PM"],
		["2027-12-05T00:05", "Sun, Dec 5, 12:05 AM"],
		["2027-11-01T09:05", "Mon, Nov 1, 9:05 AM"],
	])("formats a timed occurrence at %s as %s", (start, expected) => {
		const occurrence = firstOccurrence(start, start);
		expect(occurrence && formatOccurrence(occurrence)).toBe(expected);
	});

	it("formats an all-day occurrence without a time", () => {
		const [picnic] = expand([series({ timing: allDay("2027-06-19") })], {
			from: instant("2027-06-01T00:00:00Z"),
			to: instant("2027-07-01T00:00:00Z"),
		});
		expect(picnic && formatOccurrence(picnic)).toBe("Sat, Jun 19");
	});
});
