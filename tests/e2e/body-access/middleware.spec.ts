import type { APIRequestContext } from "@playwright/test";
import {
	NEWS,
	createNews,
	data,
	expect,
	expectDenied,
	expectIdLikeSlugRefused,
	idLikeSlug,
	newsData,
	test,
	unique,
	uniquePng,
} from "../body-access";
import { BODY_NAMES } from "../roles";

const CHAPTER = BODY_NAMES.chapter;
const LODGE = BODY_NAMES["blue-lodge"];

async function upload(client: APIRequestContext, png = uniquePng()) {
	return client.post("/_emdash/api/media", {
		multipart: { file: { name: `${unique("logo")}.png`, mimeType: "image/png", buffer: png } },
	});
}

async function revisionIds(client: APIRequestContext, id: string): Promise<string[]> {
	const list = await data<{ items: { id: string }[] }>(client.get(`${NEWS}/${id}/revisions`));
	return list.items.map((revision) => revision.id);
}

test.describe("middleware guard: writes no content hook sees (ADR-002)", () => {
	test("PUT without data cannot re-slug or unpublish Chapter content", async ({ as, bodies }) => {
		const chapter = await as("chapter");
		const id = await createNews(chapter, bodies.chapter);
		await data(chapter.post(`${NEWS}/${id}/publish`, { data: {} }));
		const lodge = await as("blue-lodge");
		await expectDenied(lodge.put(`${NEWS}/${id}`, { data: { slug: "taken-over" } }), CHAPTER);
		await expectDenied(lodge.put(`${NEWS}/${id}`, { data: { status: "draft" } }), CHAPTER);
		const after = await data<{ item: { slug: string; status: string } }>(
			chapter.get(`${NEWS}/${id}`),
		);
		expect(after.item).toMatchObject({ status: "published" });
		expect(after.item.slug).not.toBe("taken-over");
	});

	test("trash (DELETE) is refused with a readable reason", async ({ as, bodies }) => {
		const id = await createNews(await as("chapter"), bodies.chapter);
		await expectDenied((await as("blue-lodge")).delete(`${NEWS}/${id}`), CHAPTER);
	});

	test("restore from the trash is refused", async ({ as, bodies }) => {
		const chapter = await as("chapter");
		const id = await createNews(chapter, bodies.chapter);
		await data(chapter.delete(`${NEWS}/${id}`));
		await expectDenied(
			(await as("blue-lodge")).post(`${NEWS}/${id}/restore`, { data: {} }),
			CHAPTER,
		);
		await data(chapter.post(`${NEWS}/${id}/restore`, { data: {} }));
	});

	test("duplicate is refused", async ({ as, bodies }) => {
		const id = await createNews(await as("chapter"), bodies.chapter);
		await expectDenied(
			(await as("blue-lodge")).post(`${NEWS}/${id}/duplicate`, { data: {} }),
			CHAPTER,
		);
	});

	test("an entry named by slug with a locale it is not in is still guarded", async ({
		as,
		bodies,
	}) => {
		// duplicate and terms resolve a slug without the locale, so the guard must too.
		const slug = unique("chapter-news");
		await data(
			(await as("chapter")).post(NEWS, { data: { data: newsData(bodies.chapter), slug } }),
		);
		const lodge = await as("blue-lodge");
		await expectDenied(lodge.post(`${NEWS}/${slug}/duplicate?locale=zz`, { data: {} }), CHAPTER);
		await expectDenied(
			lodge.post(`${NEWS}/${slug}/terms/tag?locale=zz`, { data: { termIds: [] } }),
			CHAPTER,
		);
	});

	test("discard-draft is refused", async ({ as, bodies }) => {
		const chapter = await as("chapter");
		const id = await createNews(chapter, bodies.chapter);
		await data(chapter.post(`${NEWS}/${id}/publish`, { data: {} }));
		await data(chapter.put(`${NEWS}/${id}`, { data: { data: { title: "Pending edit" } } }));
		await expectDenied(
			(await as("blue-lodge")).post(`${NEWS}/${id}/discard-draft`, { data: {} }),
			CHAPTER,
		);
	});

	test("unschedule (DELETE schedule) is refused", async ({ as, bodies }) => {
		const chapter = await as("chapter");
		const id = await createNews(chapter, bodies.chapter);
		await data(
			chapter.post(`${NEWS}/${id}/schedule`, { data: { scheduledAt: "2027-01-01T12:00:00Z" } }),
		);
		await expectDenied((await as("blue-lodge")).delete(`${NEWS}/${id}/schedule`), CHAPTER);
	});

	test("revision restore is refused, including one that moves the entry back", async ({
		as,
		bodies,
	}) => {
		const chapter = await as("chapter");
		const id = await createNews(chapter, bodies.chapter);
		await data(chapter.put(`${NEWS}/${id}`, { data: { data: { title: "Second" } } }));
		const lodge = await as("blue-lodge");
		const [newest] = await revisionIds(chapter, id);
		await expectDenied(
			lodge.post(`/_emdash/api/revisions/${newest}/restore`, { data: {} }),
			CHAPTER,
		);

		const twoBody = await as("two-body");
		const moved = await createNews(twoBody, bodies.chapter);
		await data(twoBody.post(`${NEWS}/${moved}/publish`, { data: {} }));
		await data(twoBody.put(`${NEWS}/${moved}`, { data: { data: { body: bodies["blue-lodge"] } } }));
		await data(twoBody.post(`${NEWS}/${moved}/publish`, { data: {} }));
		const revisions = await revisionIds(twoBody, moved);
		const chapterRevision = revisions.at(-1) ?? "";
		await expectDenied(
			lodge.post(`/_emdash/api/revisions/${chapterRevision}/restore`, { data: {} }),
			CHAPTER,
		);
	});

	test("recovery revisions, locks, rooms, terms and plugin extensions are refused", async ({
		as,
		bodies,
	}) => {
		const entry = `${NEWS}/${await createNews(await as("chapter"), bodies.chapter)}`;
		const lodge = await as("blue-lodge");
		await expectDenied(lodge.post(`${entry}/revisions`, { data: {} }), CHAPTER);
		await expectDenied(lodge.post(`${entry}/lock`, { data: {} }), CHAPTER);
		await expectDenied(lodge.delete(`${entry}/lock`), CHAPTER);
		await expectDenied(lodge.post(`${entry}/room`, { data: {} }), CHAPTER);
		await expectDenied(lodge.post(`${entry}/terms/tag`, { data: { termIds: [] } }), CHAPTER);
		await expectDenied(
			lodge.post(`${entry}/plugin-extensions/body-access/panel/any`, { data: {} }),
			CHAPTER,
		);
	});

	test("@redteam a recovery revision cannot reach a trashed Chapter entry through a slug that is its id", async ({
		as,
		bodies,
	}) => {
		const admin = await as("admin");
		const trashed = await createNews(admin, bodies.chapter);
		await data(admin.delete(`${NEWS}/${trashed}`));
		// Only an Admin can still store an id-shaped slug, so the Admin makes the Lodge's decoy.
		await data(admin.post(NEWS, { data: { data: newsData(bodies["blue-lodge"]), slug: trashed } }));
		await expectDenied(
			(await as("blue-lodge")).post(`${NEWS}/${trashed}/revisions`, {
				data: { data: { title: "Injected", body: bodies.chapter }, slug: null },
			}),
			CHAPTER,
		);
	});

	test("@redteam a recovery revision cannot reach a trashed Chapter entry sharing a slug in another locale", async ({
		as,
		bodies,
	}) => {
		const admin = await as("admin");
		const slug = unique("shared");
		const chapter = await data<{ item: { id: string } }>(
			admin.post(NEWS, { data: { data: newsData(bodies.chapter), slug, locale: "aa" } }),
		);
		await data(admin.delete(`${NEWS}/${chapter.item.id}`));
		const lodge = await as("blue-lodge");
		await data(
			lodge.post(NEWS, { data: { data: newsData(bodies["blue-lodge"]), slug, locale: "en" } }),
		);
		await expectDenied(
			lodge.post(`${NEWS}/${slug}/revisions`, {
				data: { data: { title: "Injected" }, slug: null },
			}),
			CHAPTER,
		);
	});

	test("@redteam an Editor cannot save a slug that looks like an entry id", async ({
		as,
		bodies,
	}) => {
		const lodge = await as("blue-lodge");
		const id = await createNews(lodge, bodies["blue-lodge"]);
		await expectIdLikeSlugRefused(
			lodge.post(NEWS, { data: { data: newsData(bodies["blue-lodge"]), slug: idLikeSlug() } }),
		);
		await expectIdLikeSlugRefused(lodge.put(`${NEWS}/${id}`, { data: { slug: idLikeSlug() } }));
		await expectIdLikeSlugRefused(
			lodge.post(`${NEWS}/${id}/revisions`, { data: { data: {}, slug: idLikeSlug() } }),
		);
		const renamed = unique("lodge-news");
		const saved = await data<{ item: { slug: string } }>(
			lodge.put(`${NEWS}/${id}`, { data: { slug: renamed } }),
		);
		expect(saved.item.slug).toBe(renamed);
	});

	test("@redteam unpublish needs the body a pending draft moves the entry to", async ({
		as,
		bodies,
	}) => {
		const twoBody = await as("two-body");
		const id = await createNews(twoBody, bodies["blue-lodge"]);
		await data(twoBody.post(`${NEWS}/${id}/publish`, { data: {} }));
		await data(twoBody.put(`${NEWS}/${id}`, { data: { data: { body: bodies.chapter } } }));
		await expectDenied(
			(await as("blue-lodge")).post(`${NEWS}/${id}/unpublish`, { data: {} }),
			CHAPTER,
		);
		const after = await data<{ item: { status: string } }>(twoBody.get(`${NEWS}/${id}`));
		expect(after.item.status).toBe("published");
	});

	test("clearing a scheduled-publish rejection is refused", async ({ as, bodies }) => {
		const id = await createNews(await as("chapter"), bodies.chapter);
		await expectDenied(
			(await as("blue-lodge")).delete(`/_emdash/api/admin/scheduled-policy-rejections/news/${id}`),
			CHAPTER,
		);
	});

	test("an unlisted method on an EmDash route fails closed below Admin", async ({ as, bodies }) => {
		const id = await createNews(await as("blue-lodge"), bodies["blue-lodge"]);
		await expectDenied(
			(await as("blue-lodge")).patch(`${NEWS}/${id}`, { data: {} }),
			"cannot make this change",
		);
		// An Admin passes the guard; EmDash itself then refuses the method.
		const admin = await (await as("admin")).patch(`${NEWS}/${id}`, { data: {} });
		expect(admin.ok()).toBe(false);
		expect(await admin.text()).not.toContain("BODY_ACCESS_DENIED");
	});

	test("admin-only features are refused to Editors", async ({ as }) => {
		const lodge = await as("blue-lodge");
		await expectDenied(
			lodge.post("/_emdash/api/taxonomies", { data: { name: unique("tax"), label: "Tax" } }),
			"cannot make this change",
		);
		await expectDenied(
			lodge.post("/_emdash/api/taxonomies/bulk-tag", { data: {} }),
			"cannot make this change",
		);
	});
});

test.describe("middleware guard: media (ADR-002 O1)", () => {
	test("an Editor with no grant cannot upload", async ({ as }) => {
		const unassigned = await as("unassigned-editor");
		await expectDenied(upload(unassigned), "has no body grants");
		await expectDenied(
			unassigned.post("/_emdash/api/media/upload-url", {
				data: { filename: "x.png", contentType: "image/png", size: uniquePng().length },
			}),
			"has no body grants",
		);
		await expectDenied(
			unassigned.post("/_emdash/api/media/providers/any", { data: {} }),
			"has no body grants",
		);
	});

	test("only the uploader or an Admin edits, replaces or deletes a media item", async ({ as }) => {
		const lodge = await as("blue-lodge");
		const uploaded = await data<{ item: { id: string } }>(upload(lodge));
		const media = `/_emdash/api/media/${uploaded.item.id}`;
		const chapter = await as("chapter");
		await expectDenied(
			chapter.put(media, { data: { alt: "Not mine" } }),
			"did not upload this file",
		);
		await expectDenied(chapter.put(`${media}/replace`, { data: {} }), "did not upload this file");
		await expectDenied(chapter.put(`${media}/upload`, { data: {} }), "did not upload this file");
		await expectDenied(chapter.post(`${media}/confirm`, { data: {} }), "did not upload this file");
		await expectDenied(chapter.delete(media), "did not upload this file");
		await data(lodge.put(media, { data: { alt: "Lodge emblem" } }));
		await data((await as("admin")).put(media, { data: { alt: "Checked by an Admin" } }));
		await data(lodge.delete(media));
	});

	test("@redteam an identical file uploaded by a second body's editor stays the first uploader's, and the refusal says why", async ({
		as,
	}) => {
		const png = uniquePng();
		const lodge = await as("blue-lodge");
		const first = await data<{ item: { id: string } }>(upload(lodge, png));
		const chapter = await as("chapter");
		const second = await data<{ item: { id: string }; deduplicated?: boolean }>(
			upload(chapter, png),
		);
		expect(second).toMatchObject({ item: { id: first.item.id }, deduplicated: true });
		await expectDenied(
			chapter.put(`/_emdash/api/media/${first.item.id}`, { data: { alt: "Ours too" } }),
			"identical file",
		);
		await data(lodge.put(`/_emdash/api/media/${first.item.id}`, { data: { alt: LODGE } }));
	});

	test("a provider item with no recorded uploader is for Admins", async ({ as }) => {
		await expectDenied(
			(await as("blue-lodge")).delete("/_emdash/api/media/providers/any/item"),
			"did not upload this file",
		);
	});
});
