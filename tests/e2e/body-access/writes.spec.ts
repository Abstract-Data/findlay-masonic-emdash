import {
	NEWS,
	createNews,
	data,
	expect,
	expectDenied,
	expectRejected,
	failure,
	newsData,
	test,
	unique,
} from "../body-access";
import { BODY_NAMES } from "../roles";

const CHAPTER = BODY_NAMES.chapter;

test.describe("FR-5 body write isolation", () => {
	test("FR-5.2: Blue Lodge cannot create Chapter content, and the reason names the Chapter", async ({
		as,
		bodies,
	}) => {
		const lodge = await as("blue-lodge");
		await expectRejected(
			lodge.post(NEWS, { data: { data: newsData(bodies.chapter) } }),
			"SAVE_REJECTED",
			CHAPTER,
		);
		const created = await createNews(lodge, bodies["blue-lodge"]);
		expect(created).toMatch(/^[0-9A-Z]{26}$/);
	});

	test("FR-5.2: Blue Lodge cannot edit or retag Chapter content", async ({ as, bodies }) => {
		const id = await createNews(await as("chapter"), bodies.chapter);
		const lodge = await as("blue-lodge");
		await expectDenied(
			lodge.put(`${NEWS}/${id}`, { data: { data: { title: "Hijacked" } } }),
			CHAPTER,
		);
		await expectDenied(
			lodge.put(`${NEWS}/${id}`, { data: { data: { tags: [{ tag: "lodge-news" }] } } }),
			CHAPTER,
		);
	});

	test("FR-5.2: Blue Lodge cannot move its own entry to the Chapter", async ({ as, bodies }) => {
		const lodge = await as("blue-lodge");
		const id = await createNews(lodge, bodies["blue-lodge"]);
		await expectRejected(
			lodge.put(`${NEWS}/${id}`, { data: { data: { body: bodies.chapter } } }),
			"SAVE_REJECTED",
			CHAPTER,
		);
	});

	test("FR-5.2: Blue Lodge can edit a peer's Blue Lodge entry", async ({ as, bodies }) => {
		const id = await createNews(await as("peer-lodge"), bodies["blue-lodge"]);
		const saved = await data<{ item: { data: { title: string } } }>(
			(await as("blue-lodge")).put(`${NEWS}/${id}`, {
				data: { data: { title: "Edited by a peer" } },
			}),
		);
		expect(saved.item.data.title).toBe("Edited by a peer");
	});

	test("FR-5.3: an editor without the grant cannot join the entry's editing room", async ({
		as,
		bodies,
	}) => {
		// Co-editors reach a save's editedBy through the room; the save hook checks each of them
		// (tests/unit/core/acl and adapters/emdash/grants), and here the room refuses them first.
		const id = await createNews(await as("blue-lodge"), bodies["blue-lodge"]);
		await expectDenied(
			(await as("chapter")).post(`${NEWS}/${id}/room`, { data: {} }),
			BODY_NAMES["blue-lodge"],
		);
	});

	test("FR-5.4: Blue Lodge cannot trash, publish, unpublish or schedule Chapter content", async ({
		as,
		bodies,
	}) => {
		const chapter = await as("chapter");
		const draft = await createNews(chapter, bodies.chapter);
		const live = await createNews(chapter, bodies.chapter);
		await data(chapter.post(`${NEWS}/${live}/publish`, { data: {} }));
		const lodge = await as("blue-lodge");
		await expectDenied(lodge.delete(`${NEWS}/${draft}`), CHAPTER);
		await expectRejected(
			lodge.post(`${NEWS}/${draft}/publish`, { data: {} }),
			"PUBLISH_REJECTED",
			CHAPTER,
		);
		await expectRejected(
			lodge.post(`${NEWS}/${live}/unpublish`, { data: {} }),
			"UNPUBLISH_REJECTED",
			CHAPTER,
		);
		await expectRejected(
			lodge.post(`${NEWS}/${draft}/schedule`, { data: { scheduledAt: "2027-01-01T12:00:00Z" } }),
			"SCHEDULE_REJECTED",
			CHAPTER,
		);
	});

	test("FR-5.4: publishing a draft that moves the entry needs the live and the draft body", async ({
		as,
		bodies,
	}) => {
		const id = await createNews(await as("blue-lodge"), bodies["blue-lodge"]);
		await data(
			(await as("two-body")).put(`${NEWS}/${id}`, { data: { data: { body: bodies.chapter } } }),
		);
		await expectRejected(
			(await as("blue-lodge")).post(`${NEWS}/${id}/publish`, { data: {} }),
			"PUBLISH_REJECTED",
			CHAPTER,
		);
		await data((await as("two-body")).post(`${NEWS}/${id}/publish`, { data: {} }));
	});

	test("FR-5.5: a single-grant editor's entry without a body joins their body", async ({
		as,
		bodies,
	}) => {
		const created = await data<{ item: { data: { body: string } } }>(
			(await as("blue-lodge")).post(NEWS, { data: { data: newsData(undefined) } }),
		);
		expect(created.item.data.body).toBe(bodies["blue-lodge"]);
	});

	test("FR-5.6: an unassigned Editor cannot create body content", async ({ as, bodies }) => {
		const unassigned = await as("unassigned-editor");
		await expectRejected(
			unassigned.post(NEWS, { data: { data: newsData(undefined) } }),
			"SAVE_REJECTED",
			"has no body grants",
		);
		await expectRejected(
			unassigned.post(NEWS, { data: { data: newsData(bodies["blue-lodge"]) } }),
			"SAVE_REJECTED",
			BODY_NAMES["blue-lodge"],
		);
	});

	test("FR-5.7: an Admin can do everything to any body's content", async ({ as, bodies }) => {
		const admin = await as("admin");
		const id = await createNews(admin, bodies.chapter);
		const entry = `${NEWS}/${id}`;
		await data(
			admin.put(entry, { data: { data: { title: "Admin edit", body: bodies["blue-lodge"] } } }),
		);
		await data(admin.put(entry, { data: { slug: unique("admin-slug") } }));
		await data(admin.post(`${entry}/publish`, { data: {} }));
		await data(admin.post(`${entry}/unpublish`, { data: {} }));
		await data(admin.post(`${entry}/schedule`, { data: { scheduledAt: "2027-01-01T12:00:00Z" } }));
		await data(admin.delete(`${entry}/schedule`));
		await data(admin.put(entry, { data: { data: { title: "Staged" } } }));
		await data(admin.post(`${entry}/discard-draft`, { data: {} }));
		const copy = await data<{ item: { id: string } }>(
			admin.post(`${entry}/duplicate`, { data: {} }),
		);
		await data(admin.delete(entry));
		await data(admin.post(`${entry}/restore`, { data: {} }));
		await data(admin.delete(`${NEWS}/${copy.item.id}`));
	});

	test("FR-5.8: no one can clear an entry's body, and an Admin's bodyless entry is refused", async ({
		as,
		bodies,
	}) => {
		const lodge = await as("blue-lodge");
		const id = await createNews(lodge, bodies["blue-lodge"]);
		await expectRejected(
			lodge.put(`${NEWS}/${id}`, { data: { data: { body: "" } } }),
			"SAVE_REJECTED",
			"Every entry must belong to a body",
		);
		const error = await failure(
			(await as("admin")).post(NEWS, { data: { data: newsData(undefined) } }),
			422,
		);
		expect(error.message).toContain("Every entry must belong to a body");
	});
});
