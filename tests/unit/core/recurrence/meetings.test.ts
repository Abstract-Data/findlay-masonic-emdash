import { meetings, meetingsByBody } from "@core/recurrence/meetings";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, entryId, instant, series, timed } from "../../fixtures";

// Monday 2027-03-01, before the lodge's 2nd Tuesday (March 9).
const now = instant("2027-03-01T17:00:00Z");
const starts = (list: readonly { start: { toString(): string } }[]) =>
	list.map((o) => o.start.toString());

const stated = series({ rrule: "FREQ=MONTHLY;BYDAY=2TU", isStatedMeeting: true });

describe("meetings (FR-1.1, 1.3, 1.4)", () => {
	it("describes the stated meeting's rule and lists its next three dates", () => {
		const result = meetings([stated], null, now, 3);
		expect(result.schedule).toEqual({
			kind: "rule",
			text: "2nd Tuesday of each month, 7:30 PM",
			note: null,
		});
		expect(starts(result.next)).toEqual([
			"2027-03-09T19:30:00-05:00[America/New_York]",
			"2027-04-13T19:30:00-04:00[America/New_York]",
			"2027-05-11T19:30:00-04:00[America/New_York]",
		]);
	});

	it("keeps the schedule note beside the rule", () => {
		expect(meetings([stated], "Dark in July and August", now, 3).schedule).toMatchObject({
			kind: "rule",
			note: "Dark in July and August",
		});
	});

	it("ignores events that are not stated meetings", () => {
		const practice = series({ rrule: "FREQ=WEEKLY;BYDAY=TH", title: "Ritual practice" });
		expect(meetings([practice], null, now, 3)).toEqual({
			schedule: { kind: "contact-secretary" },
			next: [],
		});
	});

	it("shows the note, or else the secretary message, when no recurring stated meeting exists", () => {
		const oneOff = series({
			timing: timed("2027-03-20T10:00", "2027-03-20T12:00"),
			isStatedMeeting: true,
		});
		const withNote = meetings([oneOff], "Meets at the call of the Master", now, 3);
		expect(withNote.schedule).toEqual({ kind: "note", note: "Meets at the call of the Master" });
		expect(starts(withNote.next)).toEqual(["2027-03-20T10:00:00-04:00[America/New_York]"]);
		expect(meetings([], null, now, 3).schedule).toEqual({ kind: "contact-secretary" });
	});

	it("stops naming a rule once it has ended", () => {
		const ended = series({
			rrule: "FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270210T000000Z",
			isStatedMeeting: true,
		});
		expect(meetings([ended], null, now, 3)).toEqual({
			schedule: { kind: "contact-secretary" },
			next: [],
		});
	});

	it("takes the schedule from the stated meeting that meets soonest and merges their dates", () => {
		const summer = series({
			id: entryId(2),
			rrule: "FREQ=MONTHLY;BYDAY=4TH",
			timing: timed("2027-01-28T18:00", "2027-01-28T20:00"),
			isStatedMeeting: true,
		});
		const result = meetings([summer, stated], null, now, 3);
		expect(result.schedule).toMatchObject({ text: "2nd Tuesday of each month, 7:30 PM" });
		expect(starts(result.next)).toEqual([
			"2027-03-09T19:30:00-05:00[America/New_York]",
			"2027-03-25T18:00:00-04:00[America/New_York]",
			"2027-04-13T19:30:00-04:00[America/New_York]",
		]);
	});
});

describe("meetingsByBody (FR-1.2)", () => {
	it("gives each body only its own meetings, in the order of the bodies", () => {
		const chapter = { id: CHAPTER, scheduleNote: "Meets in the lodge room" };
		const lodge = { id: LODGE, scheduleNote: null };
		const cards = meetingsByBody([chapter, lodge], [stated], now, 1);
		expect(cards.map((card) => card.body)).toEqual([chapter, lodge]);
		expect(cards[0]?.meetings).toEqual({
			schedule: { kind: "note", note: "Meets in the lodge room" },
			next: [],
		});
		expect(starts(cards[1]?.meetings.next ?? [])).toEqual([
			"2027-03-09T19:30:00-05:00[America/New_York]",
		]);
	});
});
