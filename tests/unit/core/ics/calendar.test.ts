import { readFileSync } from "node:fs";
import { buildCalendar, type CalendarFeed } from "@core/ics/calendar";
import type { EntryId } from "@core/ids";
import { describe, expect, it } from "vitest";
import { allDay, entryId, instant, series, timed } from "../../fixtures";

const statedMeeting = series({
	id: entryId(1),
	title: "Stated Meeting",
	location: "Findlay Masonic Temple, Lodge Room",
	timing: timed("2027-01-12T19:30", "2027-01-12T21:30"),
	rrule: "FREQ=MONTHLY;BYDAY=2TU",
	except: ["2027-07-13", "2027-08-10"],
	isStatedMeeting: true,
});

const picnic = series({
	id: entryId(2),
	title: "Temple Picnic",
	location: null,
	timing: allDay("2027-06-19"),
	rrule: "FREQ=YEARLY;BYMONTH=6;BYDAY=3SA",
	except: ["2028-06-17"],
});

const installation = series({
	id: entryId(3),
	title: "Installation of Officers",
	timing: timed("2027-12-04T14:00", "2027-12-04T16:00"),
});

const feed: CalendarFeed = {
	name: "Findlay Lodge No. 227",
	uidDomain: "findlaymason.org",
	stamp: instant("2026-11-23T00:00:00Z"),
	series: [statedMeeting, picnic, installation],
	descriptions: new Map<EntryId, string>([
		[statedMeeting.id, "Dinner at 6:30 PM; all Master Masons welcome."],
	]),
};

const lines = (ics: string) => ics.split("\r\n");

describe("buildCalendar (FR-4.5)", () => {
	const ics = buildCalendar(feed);

	it("matches the reviewed Blue Lodge golden file byte for byte", () => {
		const golden = readFileSync(new URL("__fixtures__/blue-lodge.ics", import.meta.url), "utf8");
		expect(ics).toBe(golden);
	});

	it("ends every line, the last included, with CRLF and has no bare LF", () => {
		expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
		expect(ics.replaceAll("\r\n", "")).not.toContain("\n");
	});

	it("carries one America/New_York VTIMEZONE", () => {
		expect(lines(ics).filter((l) => l === "BEGIN:VTIMEZONE")).toHaveLength(1);
		expect(lines(ics)).toContain("TZID:America/New_York");
	});

	it("stamps every event in UTC", () => {
		const stamps = lines(ics).filter((l) => l.startsWith("DTSTAMP"));
		expect(stamps).toEqual(Array(3).fill("DTSTAMP:20261123T000000Z"));
	});

	it("keeps RRULE verbatim and places EXDATEs at the series' wall time with TZID", () => {
		expect(lines(ics)).toEqual(
			expect.arrayContaining([
				"UID:01JE0000000000000000000001@findlaymason.org",
				"DTSTART;TZID=America/New_York:20270112T193000",
				"DTEND;TZID=America/New_York:20270112T213000",
				"RRULE:FREQ=MONTHLY;BYDAY=2TU",
				"EXDATE;TZID=America/New_York:20270713T193000",
				"EXDATE;TZID=America/New_York:20270810T193000",
			]),
		);
	});

	it("writes all-day events and their EXDATEs as DATE values", () => {
		expect(lines(ics)).toEqual(
			expect.arrayContaining([
				"DTSTART;VALUE=DATE:20270619",
				"DTEND;VALUE=DATE:20270620",
				"RRULE:FREQ=YEARLY;BYMONTH=6;BYDAY=3SA",
				"EXDATE;VALUE=DATE:20280617",
			]),
		);
	});

	it("escapes text values and adds a description only where one is given", () => {
		expect(lines(ics)).toContain("DESCRIPTION:Dinner at 6:30 PM\\; all Master Masons welcome.");
		expect(lines(ics).filter((l) => l.startsWith("DESCRIPTION"))).toHaveLength(1);
		expect(lines(ics)).toContain("LOCATION:Findlay Masonic Temple\\, Lodge Room");
	});

	it("produces an empty but valid calendar for a body with no events", () => {
		expect(lines(buildCalendar({ ...feed, series: [] }))).toEqual([
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//findlaymason.org//calendar//EN",
			"NAME:Findlay Lodge No. 227",
			"X-WR-CALNAME:Findlay Lodge No. 227",
			"END:VCALENDAR",
			"",
		]);
	});
});
