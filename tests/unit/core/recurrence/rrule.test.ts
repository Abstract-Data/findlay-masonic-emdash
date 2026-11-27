import { parseRRule, rruleErrorText, type RRuleError } from "@core/recurrence/rrule";
import { describe, expect, it } from "vitest";
import { allDay, timed } from "../../fixtures";

const tuesday = timed("2027-01-12T19:30", "2027-01-12T21:30");
const picnic = allDay("2027-06-19");

describe("parseRRule (FR-4.2): accepts", () => {
	it.each([
		"FREQ=MONTHLY;BYDAY=2TU",
		"FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2",
		"FREQ=MONTHLY;BYDAY=1TU,3TU",
		"FREQ=MONTHLY;BYDAY=-1TU",
		"FREQ=MONTHLY;BYDAY=+2TU",
		"FREQ=WEEKLY;BYDAY=TU",
		"FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;WKST=SU",
		"FREQ=MONTHLY;BYMONTHDAY=12",
		"FREQ=MONTHLY;BYDAY=2TU;BYMONTH=1,2,3,4,5,9,10,11,12",
		"FREQ=YEARLY;BYMONTH=1;BYDAY=2TU",
		"FREQ=DAILY;COUNT=10",
		"FREQ=WEEKLY;UNTIL=20271231T235959Z",
	])("%s", (raw) => {
		expect(parseRRule(raw, tuesday)).toMatchObject({ ok: true, value: { text: raw } });
	});

	it("normalizes case, surrounding space and an RRULE: prefix", () => {
		expect(parseRRule("  rrule:freq=monthly;byday=2tu ", tuesday)).toMatchObject({
			ok: true,
			value: { text: "FREQ=MONTHLY;BYDAY=2TU" },
		});
	});

	it("exposes the parsed parts", () => {
		expect(
			parseRRule("FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU,-1TH,FR;BYSETPOS=1", tuesday),
		).toMatchObject({
			ok: true,
			value: {
				freq: "MONTHLY",
				interval: 2,
				byDay: [
					{ ordinal: 2, weekday: "TU" },
					{ ordinal: -1, weekday: "TH" },
					{ ordinal: null, weekday: "FR" },
				],
				bySetPos: [1],
				byMonthDay: [],
				byMonth: [],
			},
		});
		expect(parseRRule("FREQ=WEEKLY", tuesday)).toMatchObject({ ok: true, value: { interval: 1 } });
	});

	it("accepts an all-day rule whose UNTIL is a DATE, as its ICS DTSTART is", () => {
		expect(parseRRule("FREQ=YEARLY;UNTIL=20301231", picnic).ok).toBe(true);
	});
});

describe("parseRRule (FR-4.2): rejects", () => {
	it.each([
		["FREQ=MONTHLY;BYDAY=2TU;GARBAGE=1", { code: "unsupported-part", part: "GARBAGE" }],
		["FREQ=DAILY;BYHOUR=9", { code: "unsupported-part", part: "BYHOUR" }],
		["FREQ=MONTHLY;BYMONTHDAY=40", { code: "out-of-range", part: "BYMONTHDAY", value: "40" }],
		["FREQ=MONTHLY;BYDAY=2TU;COUNT=-3", { code: "out-of-range", part: "COUNT", value: "-3" }],
		["FREQ=WEEKLY;INTERVAL=0", { code: "out-of-range", part: "INTERVAL", value: "0" }],
		["FREQ=WEEKLY;INTERVAL=1,2", { code: "out-of-range", part: "INTERVAL", value: "1,2" }],
		["FREQ=MONTHLY;BYDAY=6TU", { code: "out-of-range", part: "BYDAY", value: "6TU" }],
		["FREQ=MONTHLY;BYDAY=2TU,2XX", { code: "out-of-range", part: "BYDAY", value: "2XX" }],
		["FREQ=YEARLY;BYMONTH=13", { code: "out-of-range", part: "BYMONTH", value: "13" }],
		["FREQ=MONTHLY;BYDAY=TU;BYSETPOS=9", { code: "out-of-range", part: "BYSETPOS", value: "9" }],
		["FREQ=WEEKLY;WKST=XX", { code: "out-of-range", part: "WKST", value: "XX" }],
		["FREQ=WEEKLY;UNTIL=2027", { code: "out-of-range", part: "UNTIL", value: "2027" }],
		["FREQ=HOURLY", { code: "unsupported-freq", freq: "HOURLY" }],
		["FREQ=FORTNIGHTLY", { code: "unsupported-freq", freq: "FORTNIGHTLY" }],
		["FREQ=MONTHLY;BYDAY=2TU;COUNT=3;UNTIL=20271231T000000Z", { code: "count-and-until" }],
		["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", { code: "never-occurs" }],
	])("%s", (raw, error) => {
		expect(parseRRule(raw, tuesday)).toEqual({ ok: false, error });
	});

	it.each([
		["empty", ""],
		["an embedded VEVENT", "FREQ=WEEKLY\r\nBEGIN:VEVENT"],
		["a colon", "FREQ=WEEKLY;X-NAME:1"],
		["a missing FREQ", "BYDAY=TU"],
		["a part without a value", "FREQ=WEEKLY;BYDAY="],
		["a part without a name", "FREQ=WEEKLY;=TU"],
		["a part without =", "FREQ=WEEKLY;BYDAY"],
		["a repeated part", "FREQ=WEEKLY;FREQ=DAILY"],
		["an empty part", "FREQ=WEEKLY;;BYDAY=TU"],
	])("%s as a syntax error", (_label, raw) => {
		expect(parseRRule(raw, tuesday)).toEqual({ ok: false, error: { code: "syntax" } });
	});

	it("rejects a timed start in the 02:00 hour, which spring-forward skips", () => {
		expect(parseRRule("FREQ=DAILY", timed("2027-03-12T02:30", "2027-03-12T03:00"))).toEqual({
			ok: false,
			error: { code: "dst-gap-time" },
		});
	});

	it("passes through what the library rejects with its reason", () => {
		const cases = [
			["FREQ=WEEKLY;BYDAY=2TU", tuesday, "BYDAY with numeric value"],
			["FREQ=MONTHLY;BYSETPOS=2", tuesday, "BYSETPOS MUST be used with another BYxxx"],
			["FREQ=WEEKLY;UNTIL=20271231", tuesday, "UNTIL"],
			["FREQ=YEARLY;UNTIL=20301231T000000Z", picnic, "UNTIL"],
		] as const;
		for (const [raw, timing, message] of cases) {
			const parsed = parseRRule(raw, timing);
			expect(parsed).toMatchObject({ ok: false, error: { code: "library-rejected" } });
			expect(JSON.stringify(parsed)).toContain(message);
		}
	});
});

function textFor(rule: string, timing = tuesday): string {
	const parsed = parseRRule(rule, timing);
	if (parsed.ok) throw new Error(`${rule} was accepted`);
	return rruleErrorText(parsed.error);
}

describe("rruleErrorText (FR-4.2)", () => {
	it.each([
		["GARBAGE", "Write NAME=value pairs"],
		["FREQ=MONTHLY;GARBAGE=1", "part GARBAGE is not supported"],
		["FREQ=HOURLY", "frequency HOURLY is not supported"],
		["FREQ=MONTHLY;BYMONTHDAY=40", "value 40 is not valid for BYMONTHDAY"],
		["FREQ=DAILY;COUNT=3;UNTIL=20270201", "both COUNT and UNTIL"],
		["FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30", "no meeting in the next five years"],
	])("explains %s in plain words", (rule, phrase) => {
		expect(textFor(rule)).toContain(phrase);
	});

	it("explains a start in the skipped spring-forward hour", () => {
		expect(textFor("FREQ=WEEKLY", timed("2027-01-12T02:30", "2027-01-12T03:30"))).toContain(
			"between 2:00 and 2:59 AM, because those times are skipped on the spring daylight-saving day",
		);
	});

	it("explains a rule the library refuses without leaking its message", () => {
		const text = rruleErrorText({ code: "library-rejected", message: "<internal> stack" });
		expect(text).toContain("check that UNTIL matches the start date and time");
		expect(text).not.toContain("internal");
	});

	it("gives each error its own message, short and free of angle brackets", () => {
		const errors: readonly RRuleError[] = [
			{ code: "syntax" },
			{ code: "unsupported-part", part: "X" },
			{ code: "unsupported-freq", freq: "HOURLY" },
			{ code: "out-of-range", part: "COUNT", value: "0" },
			{ code: "count-and-until" },
			{ code: "never-occurs" },
			{ code: "dst-gap-time" },
			{ code: "library-rejected", message: "" },
		];
		const texts = errors.map(rruleErrorText);
		expect(new Set(texts).size).toBe(errors.length);
		for (const text of texts) {
			expect(text.length).toBeLessThanOrEqual(500);
			expect(text).not.toMatch(/[<>]/);
		}
	});
});
