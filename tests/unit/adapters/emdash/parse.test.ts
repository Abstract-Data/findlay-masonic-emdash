import {
	isAdminRole,
	parseAbsoluteUrl,
	parseBodyId,
	parseBodyRecord,
	parseEditor,
	parseEntryId,
	parseErrorText,
	parseEventSchedule,
	parseEventSeries,
	parseTagVocabulary,
	parseTags,
	parseUserId,
	parseWallTime,
	toStoredInstant,
} from "@adapters/emdash/parse";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { LODGE, date, entryId, tag } from "../../fixtures";

const EVENT_ID = entryId(1);

const statedMeeting = {
	id: EVENT_ID,
	body: LODGE,
	title: " Stated Meeting ",
	start: "2027-01-13T00:30:00.000Z",
	end: "2027-01-13T02:30:00.000Z",
	all_day: false,
	rrule: "FREQ=MONTHLY;BYDAY=2TU",
	exdates: ["2027-07-13"],
	location: "",
	is_stated_meeting: true,
};

describe("ids", () => {
	it("accepts ULIDs for body and entry ids and rejects anything else", () => {
		expect(parseBodyId(LODGE)).toBe(LODGE);
		expect(parseEntryId(EVENT_ID)).toBe(EVENT_ID);
		for (const raw of [
			"blue-lodge",
			"01jb0000000000000000000001",
			"01JB000000000000000000000I",
			42,
			null,
		]) {
			expect(parseBodyId(raw)).toBeNull();
			expect(parseEntryId(raw)).toBeNull();
		}
	});

	it("accepts any non-blank user id", () => {
		expect(parseUserId("user_1")).toBe("user_1");
		expect(parseUserId(" ")).toBeNull();
		expect(parseUserId(7)).toBeNull();
	});

	it("accepts only http and https absolute URLs", () => {
		expect(parseAbsoluteUrl("https://findlaymason.org/news/1")).toBe(
			"https://findlaymason.org/news/1",
		);
		expect(parseAbsoluteUrl("http://localhost/x")).toBe("http://localhost/x");
		expect(parseAbsoluteUrl("/news/1")).toBeNull();
		expect(parseAbsoluteUrl("javascript:alert(1)")).toBeNull();
		expect(parseAbsoluteUrl(undefined)).toBeNull();
	});
});

describe("tags", () => {
	it("flattens news.tags repeater rows into normalized, de-duplicated slugs", () => {
		expect(
			parseTags([
				{ tag: "Ritual Work " },
				{ tag: "ritual-work" },
				{ tag: "" },
				{},
				{ tag: "Raffle" },
			]),
		).toEqual({
			ok: true,
			value: [tag("ritual-work"), tag("raffle")],
		});
	});

	it("treats a missing repeater as no tags and rejects malformed rows", () => {
		expect(parseTags(undefined)).toEqual({ ok: true, value: [] });
		expect(parseTags(null)).toEqual({ ok: true, value: [] });
		expect(parseTags("ritual")).toEqual({
			ok: false,
			error: { code: "invalid-field", field: "tags" },
		});
		expect(parseTags(["ritual"])).toEqual({
			ok: false,
			error: { code: "invalid-field", field: "tags" },
		});
		expect(parseTags([{ tag: 3 }])).toEqual({
			ok: false,
			error: { code: "invalid-field", field: "tags" },
		});
	});

	it("reads a body's vocabulary from its { slug, label } rows with the same normalization", () => {
		const parsed = parseTagVocabulary([
			{ slug: "Ritual Work", label: "Ritual work" },
			{ slug: "raffle", label: "Raffle" },
			{ slug: " ", label: "Blank" },
		]);
		expect(parsed).toEqual({ ok: true, value: new Set([tag("ritual-work"), tag("raffle")]) });
		expect(parseTagVocabulary(5)).toEqual({
			ok: false,
			error: { code: "invalid-field", field: "tag_vocabulary" },
		});
	});
});

describe("parseWallTime", () => {
	it("converts a stored UTC instant to New York wall time on both sides of DST", () => {
		expect(parseWallTime("2027-01-13T00:30:00.000Z")?.toString()).toBe("2027-01-12T19:30:00");
		expect(parseWallTime("2027-07-13T23:30:00.000Z")?.toString()).toBe("2027-07-13T19:30:00");
	});

	it("rejects naive or malformed datetimes", () => {
		expect(parseWallTime("2027-01-12T19:30:00")).toBeNull();
		expect(parseWallTime("soon")).toBeNull();
		expect(parseWallTime(1_700_000_000)).toBeNull();
	});
});

describe("parseEditor", () => {
	it("marks role 50 and above as Admin and keeps the body grants", () => {
		expect(parseEditor({ id: "u1", role: 40 }, [LODGE])).toEqual({
			ok: true,
			value: { id: "u1", isAdmin: false, grants: new Set([LODGE]) },
		});
		expect(parseEditor({ id: "u2", role: 50 }, [])).toMatchObject({
			ok: true,
			value: { isAdmin: true },
		});
	});

	it("rejects a missing id, a non-numeric role or a malformed grant", () => {
		expect(parseEditor({ id: "", role: 40 }, [])).toEqual({
			ok: false,
			error: { code: "invalid-field", field: "id" },
		});
		expect(parseEditor({ id: "u1", role: "admin" }, [])).toEqual({
			ok: false,
			error: { code: "invalid-field", field: "role" },
		});
		expect(parseEditor({ id: "u1", role: 40 }, [LODGE, "chapter"])).toEqual({
			ok: false,
			error: { code: "invalid-field", field: "grants" },
		});
	});
});

describe("parseEventSeries", () => {
	it("parses a recurring stated meeting into wall-clock timing, rule and EXDATEs", () => {
		const parsed = parseEventSeries(statedMeeting);
		expect(parsed).toMatchObject({
			ok: true,
			value: {
				id: EVENT_ID,
				body: LODGE,
				title: "Stated Meeting",
				location: null,
				isStatedMeeting: true,
				recurrence: { rule: { text: "FREQ=MONTHLY;BYDAY=2TU" }, except: [date("2027-07-13")] },
			},
		});
		expect(parsed.ok && parsed.value.timing).toEqual({
			kind: "timed",
			start: Temporal.PlainDateTime.from("2027-01-12T19:30"),
			end: Temporal.PlainDateTime.from("2027-01-12T21:30"),
		});
	});

	it("parses a one-off event with no rule, EXDATEs or flags", () => {
		const parsed = parseEventSeries({
			...statedMeeting,
			rrule: "  ",
			exdates: undefined,
			location: "Lodge Room",
			is_stated_meeting: undefined,
		});
		expect(parsed).toMatchObject({
			ok: true,
			value: { recurrence: null, location: "Lodge Room", isStatedMeeting: false },
		});
	});

	it("reads an all-day event's local-midnight end as exclusive", () => {
		const fair = {
			...statedMeeting,
			all_day: true,
			rrule: null,
			start: "2027-06-18T04:00:00.000Z",
			end: "2027-06-20T04:00:00.000Z",
		};
		expect(parseEventSeries(fair)).toMatchObject({
			ok: true,
			value: { timing: { kind: "all-day", first: date("2027-06-18"), last: date("2027-06-19") } },
		});
		const sameDay = { ...fair, end: "2027-06-18T04:00:00.000Z" };
		expect(parseEventSeries(sameDay)).toMatchObject({
			ok: true,
			value: { timing: { kind: "all-day", first: date("2027-06-18"), last: date("2027-06-18") } },
		});
		const lateEnd = { ...fair, end: "2027-06-19T20:00:00.000Z" };
		expect(parseEventSeries(lateEnd)).toMatchObject({
			ok: true,
			value: { timing: { kind: "all-day", last: date("2027-06-19") } },
		});
	});

	it("rejects an end before the start", () => {
		expect(parseEventSeries({ ...statedMeeting, end: "2027-01-12T23:00:00.000Z" })).toEqual({
			ok: false,
			error: { code: "end-before-start" },
		});
		expect(
			parseEventSeries({ ...statedMeeting, all_day: true, end: "2027-01-11T12:00:00.000Z" }),
		).toEqual({ ok: false, error: { code: "end-before-start" } });
	});

	it("passes an invalid rule's reason through (FR-4.2)", () => {
		expect(parseEventSeries({ ...statedMeeting, rrule: "FREQ=HOURLY" })).toEqual({
			ok: false,
			error: { code: "rrule", error: { code: "unsupported-freq", freq: "HOURLY" } },
		});
	});

	it.each([
		["id", { id: "evt-1" }],
		["body", { body: null }],
		["title", { title: "" }],
		["start", { start: "2027-01-12T19:30:00" }],
		["end", { end: undefined }],
		["exdates", { exdates: "2027-07-13" }],
		["exdates", { exdates: ["2027-02-30"] }],
		["exdates", { exdates: ["July 13"] }],
		["exdates", { exdates: [20270713] }],
	])("names the invalid field %s", (field, change) => {
		expect(parseEventSeries({ ...statedMeeting, ...change })).toEqual({
			ok: false,
			error: { code: "invalid-field", field },
		});
	});
});

describe("isAdminRole", () => {
	it("is EmDash's Admin role and above", () => {
		expect([10, 20, 30, 40, 50].map(isAdminRole)).toEqual([false, false, false, false, true]);
	});
});

describe("toStoredInstant (event saves)", () => {
	it("reads a datetime without an offset as site time, as EmDash stores it", () => {
		expect(toStoredInstant("2027-01-12T19:30")).toBe("2027-01-13T00:30:00Z");
		expect(toStoredInstant("2027-07-13 19:30:00.000")).toBe("2027-07-13T23:30:00Z");
		expect(toStoredInstant("2027-03-14")).toBe("2027-03-14T05:00:00Z");
	});

	it("keeps an instant, a malformed value or a non-string as sent", () => {
		expect(toStoredInstant("2027-01-13T00:30:00.000Z")).toBe("2027-01-13T00:30:00.000Z");
		expect(toStoredInstant("2027-02-30T10:00")).toBe("2027-02-30T10:00");
		expect(toStoredInstant(null)).toBeNull();
	});
});

describe("parseEventSchedule (FR-4.2)", () => {
	it("accepts the schedule of a stated meeting", () => {
		expect(parseEventSchedule(statedMeeting).ok).toBe(true);
	});

	it("refuses a rule that cannot repeat from its start, in plain words", () => {
		const parsed = parseEventSchedule({ ...statedMeeting, rrule: "FREQ=HOURLY" });
		expect(parsed.ok).toBe(false);
		expect(!parsed.ok && parseErrorText(parsed.error)).toContain("HOURLY is not supported");
	});
});

describe("parseErrorText", () => {
	it("names the field, the end-before-start problem and the rule problem", () => {
		expect(parseErrorText({ code: "invalid-field", field: "tag_vocabulary" })).toBe(
			"The tag vocabulary value is missing or not valid.",
		);
		expect(parseErrorText({ code: "end-before-start" })).toContain("ends before it starts");
		expect(parseErrorText({ code: "rrule", error: { code: "dst-gap-time" } })).toContain(
			"skipped on the spring daylight-saving day",
		);
	});
});

describe("parseBodyRecord", () => {
	it("reads the display name, body type, colour, vocabulary and order of a bodies entry", () => {
		expect(
			parseBodyRecord({
				id: LODGE,
				data: {
					name: "Findlay Lodge",
					number: 227,
					body_type: "Blue Lodge",
					colour: "Green",
					tag_vocabulary: [{ slug: "Ritual", label: "Ritual" }],
					display_order: 1,
				},
			}),
		).toEqual({
			id: LODGE,
			displayName: "Findlay Lodge No. 227",
			bodyType: "Blue Lodge",
			colour: "Green",
			vocabulary: new Set([tag("ritual")]),
			order: 1,
		});
	});

	it("fails closed on what it cannot read", () => {
		expect(
			parseBodyRecord({ id: LODGE, data: { tag_vocabulary: "x", body_type: "Lodge" } }),
		).toEqual({
			id: LODGE,
			displayName: LODGE,
			bodyType: null,
			colour: null,
			vocabulary: new Set(),
			order: Number.MAX_SAFE_INTEGER,
		});
		expect(parseBodyRecord({ id: "not-a-body", data: {} })).toBeNull();
		expect(parseBodyRecord({ id: LODGE, data: null })).toBeNull();
	});
});
