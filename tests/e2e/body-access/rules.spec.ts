import { NEWS, data, expect, expectRejected, newsData, test, unique } from "../body-access";
import { BODY_NAMES } from "../roles";

const OFFICERS = "/_emdash/api/content/officers";
const EVENTS = "/_emdash/api/content/events";
const LODGE = BODY_NAMES["blue-lodge"];

test.describe("save-time content rules", () => {
	test.beforeAll(async ({ as, bodies }) => {
		// The Lodge keeps its own tag list on its bodies entry (constitution: never a taxonomy).
		await data(
			(await as("blue-lodge")).put(`/_emdash/api/content/bodies/${bodies["blue-lodge"]}`, {
				data: { data: { tag_vocabulary: [{ slug: "ritual", label: "Ritual" }] } },
			}),
		);
	});

	test("FR-3.2: a tag outside the body's vocabulary is rejected, a listed one saves", async ({
		as,
		bodies,
	}) => {
		const lodge = await as("blue-lodge");
		const tagged = (tag: string) => ({ data: newsData(bodies["blue-lodge"], { tags: [{ tag }] }) });
		await data(lodge.post(NEWS, { data: tagged("Ritual") }));
		await expectRejected(
			lodge.post(NEWS, { data: tagged("bake-sale") }),
			"SAVE_REJECTED",
			`${LODGE} tag list: bake-sale`,
		);
	});

	test("FR-2.1: an officer title from another body type is rejected", async ({ as, bodies }) => {
		const lodge = await as("blue-lodge");
		const officer = (title: string) => ({
			data: { body: bodies["blue-lodge"], title, name: unique("Brother"), term_year: 2027 },
		});
		await data(lodge.post(OFFICERS, { data: officer("Worshipful Master") }));
		await expectRejected(
			lodge.post(OFFICERS, { data: officer("High Priest") }),
			"SAVE_REJECTED",
			'"High Priest" is not on the officer title list for Blue Lodge',
		);
	});

	test("FR-4.2: an event's RRULE must repeat from its start, in plain words", async ({
		as,
		bodies,
	}) => {
		const lodge = await as("blue-lodge");
		// 7:30 PM and 2:30 AM in New York in January (UTC-5); the API takes instants.
		const evening = "2027-01-13T00:30:00.000Z";
		const event = (rrule: string, start = evening) => ({
			data: {
				body: bodies["blue-lodge"],
				title: unique("Stated Meeting"),
				start,
				end: "2027-01-13T02:30:00.000Z",
				rrule,
			},
		});
		const created = await data<{ item: { data: { rrule: string } } }>(
			lodge.post(EVENTS, { data: event("FREQ=MONTHLY;BYDAY=2TU") }),
		);
		expect(created.item.data.rrule).toBe("FREQ=MONTHLY;BYDAY=2TU");
		await expectRejected(
			lodge.post(EVENTS, { data: event("FREQ=HOURLY") }),
			"SAVE_REJECTED",
			"HOURLY is not supported",
		);
		await expectRejected(
			lodge.post(EVENTS, { data: event("FREQ=MONTHLY;BYMONTHDAY=40") }),
			"SAVE_REJECTED",
			"40 is not valid for BYMONTHDAY",
		);
		await expectRejected(
			lodge.post(EVENTS, { data: event("FREQ=WEEKLY", "2027-01-12T07:30:00.000Z") }),
			"SAVE_REJECTED",
			"skipped on the spring daylight-saving day",
		);
	});
});
