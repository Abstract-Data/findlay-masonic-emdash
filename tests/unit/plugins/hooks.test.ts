import { actorStore, type RequestActor } from "@adapters/emdash/actor-context";
import type { EntryRow } from "@adapters/emdash/entries";
import type { Grant } from "@adapters/emdash/grants";
import type { BodyId } from "@core/ids";
import { beforeDelete, beforeSave, policyHook, type HookContext } from "@plugins/body-access/hooks";
import type { ContentHookEvent, ContentPolicyEvent } from "emdash";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, entryId } from "../fixtures";

const lodgeEditor: RequestActor = { id: "lodge-editor", role: 40 };
const twoBodyEditor: RequestActor = { id: "two-body-editor", role: 40 };
const GRANTS: readonly Grant[] = [
	{ userId: "lodge-editor", bodyId: LODGE },
	{ userId: "two-body-editor", bodyId: LODGE },
	{ userId: "two-body-editor", bodyId: CHAPTER },
];

const BODY_PAGES: readonly EntryRow[] = [
	{ id: LODGE, data: { name: "Findlay Lodge", number: 227, body_type: "Blue Lodge" } },
	{ id: CHAPTER, data: { name: "Findlay Chapter", number: 58, body_type: "Chapter" } },
];

/** Plugin context over stored news entries and their drafts; a missing draft reads as null. */
function context(
	news: readonly EntryRow[],
	drafts: Readonly<Record<string, Record<string, unknown>>> = {},
): HookContext {
	const rows = new Map([...news, ...BODY_PAGES].map((row) => [row.id, row]));
	return {
		content: {
			get: async (_collection, id) => rows.get(id) ?? null,
			list: async () => ({ items: BODY_PAGES }),
			getRevision: async (_collection, _id, revisionId) => {
				const data = drafts[revisionId];
				return data === undefined ? null : { data };
			},
		},
		storage: {
			grants: {
				query: async ({ where }) => ({
					items: GRANTS.filter((grant) => grant.userId === where?.userId).map((data) => ({
						id: `${data.userId}:${data.bodyId}`,
						data,
					})),
					hasMore: false,
				}),
				putMany: async () => undefined,
				deleteMany: async () => 0,
			},
		},
		users: { get: async (id) => ({ role: id === "admin" ? 50 : 40 }) },
	};
}

const newsSave = (body: BodyId, more: Partial<ContentHookEvent> = {}): ContentHookEvent => ({
	collection: "news",
	content: { title: "Ladies Night", body, content: [] },
	isNew: true,
	...more,
});

const policy = (
	collection: string,
	id: string,
	origin: ContentPolicyEvent["origin"] = { source: "api" },
): ContentPolicyEvent => ({ collection, content: { id }, origin });

describe("beforeSave: who a write acts for (red team 6)", () => {
	it("holds a write with no event actor to the signed-in user of the request it runs in", async () => {
		const save = actorStore.run(lodgeEditor, async () =>
			beforeSave(newsSave(CHAPTER), context([])),
		);
		await expect(save).rejects.toThrow("Findlay Chapter No. 58");
	});

	it("lets a write outside any signed-in request through, as a system write (D2)", async () => {
		await expect(beforeSave(newsSave(CHAPTER), context([]))).resolves.toBeUndefined();
		const anonymous = actorStore.run(null, async () => beforeSave(newsSave(CHAPTER), context([])));
		await expect(anonymous).resolves.toBeUndefined();
	});

	it("prefers the event's own actor", async () => {
		const save = actorStore.run(twoBodyEditor, async () =>
			beforeSave(newsSave(CHAPTER, { actor: lodgeEditor }), context([])),
		);
		await expect(save).rejects.toThrow("Findlay Chapter No. 58");
	});
});

describe("beforeSave: pending drafts (red team 7)", () => {
	it("refuses an update when the entry's pending draft cannot be read", async () => {
		const entry = { id: entryId(1), data: { body: LODGE }, draftRevisionId: "R1" };
		const update = newsSave(LODGE, { isNew: false, id: entryId(1), actor: lodgeEditor });
		await expect(beforeSave(update, context([entry]))).rejects.toThrow("pending draft is missing");
		await expect(
			beforeSave(update, context([entry], { R1: { body: LODGE } })),
		).resolves.toBeUndefined();
	});

	it("tells an Admin and an editor alike to discard the missing draft (parked b)", async () => {
		const entry = { id: entryId(1), data: { body: LODGE }, draftRevisionId: "R1" };
		const by = async (actor: RequestActor) =>
			beforeSave(newsSave(LODGE, { isNew: false, id: entryId(1), actor }), context([entry]));
		for (const actor of [{ id: "admin", role: 50 }, lodgeEditor]) {
			// oxlint-disable-next-line no-await-in-loop -- one actor at a time.
			const refusal = await by(actor).catch((error: unknown) => String(error));
			expect(refusal).toContain("Choose Discard changes on the entry");
			expect(refusal).not.toContain("ask a Temple administrator");
		}
	});
});

// A co-editing room's checkpoint stages its slug on the draft as `_slug`, past the middleware,
// and content:beforeSave is never handed it; publishing is when it would go live.
const staged = (slug: string) => ({
	entry: { id: entryId(1), data: { body: LODGE }, draftRevisionId: "R1" },
	drafts: { R1: { body: LODGE, _slug: slug } },
});

describe("publish and schedule: a staged slug shaped like an entry id (parked d)", () => {
	it.each(["publish", "schedule"] as const)(
		"refuses an editor's %s of a draft whose staged slug looks like an entry id",
		async (change) => {
			const { entry, drafts } = staged(entryId(9));
			const event = { ...policy("news", entryId(1)), actor: lodgeEditor };
			expect(await policyHook(change)(event, context([entry], drafts))).toEqual({
				cancel: true,
				reason: expect.stringContaining("looks like an entry id"),
			});
		},
	);

	it("publishes a staged slug made of words, and leaves an Admin's slug to the Admin", async () => {
		const event = { ...policy("news", entryId(1)), actor: lodgeEditor };
		const words = staged("spring-banquet");
		expect(
			await policyHook("publish")(event, context([words.entry], words.drafts)),
		).toBeUndefined();
		const ids = staged(entryId(9));
		const admin = { ...event, actor: { id: "admin", role: 50 } };
		expect(await policyHook("publish")(admin, context([ids.entry], ids.drafts))).toBeUndefined();
		expect(await policyHook("unpublish")(event, context([ids.entry], ids.drafts))).toBeUndefined();
	});
});

const translation = (body: BodyId) =>
	newsSave(body, { actor: twoBodyEditor, translationOf: entryId(1), locale: "fr" });

describe("beforeSave: translations stay in one body (red team 8)", () => {
	const source = { id: entryId(1), data: { body: CHAPTER } };

	it("refuses a translation in another body than its source's", async () => {
		await expect(beforeSave(translation(LODGE), context([source]))).rejects.toThrow(
			"Choose Findlay Chapter No. 58 as its body",
		);
	});

	it("accepts a translation in its source's body", async () => {
		await expect(beforeSave(translation(CHAPTER), context([source]))).resolves.toBeUndefined();
	});
});

describe("policy hooks (red team 3 and 4)", () => {
	const moved = { id: entryId(1), data: { body: LODGE }, draftRevisionId: "R1" };

	it("checks the body a pending draft moves the entry to before an unpublish", async () => {
		const unpublish = policyHook("unpublish");
		const event = { ...policy("news", entryId(1)), actor: lodgeEditor };
		expect(await unpublish(event, context([moved], { R1: { body: CHAPTER } }))).toEqual({
			cancel: true,
			reason: expect.stringContaining("Findlay Chapter No. 58"),
		});
		expect(await unpublish(event, context([moved], { R1: { body: LODGE } }))).toBeUndefined();
	});

	it.each(["unpublish", "schedule"] as const)(
		"leaves a %s of a body's own page to Admins",
		async (change) => {
			const event = { ...policy("bodies", LODGE), actor: lodgeEditor };
			expect(await policyHook(change)(event, context([]))).toEqual({
				cancel: true,
				reason: expect.stringContaining("cannot trash, unpublish or schedule a body's page"),
			});
			const admin = { ...event, actor: { id: "admin", role: 50 } };
			expect(await policyHook(change)(admin, context([]))).toBeUndefined();
		},
	);

	it("lets a body's editor publish the body's own page", async () => {
		const event = { ...policy("bodies", LODGE), actor: lodgeEditor };
		expect(await policyHook("publish")(event, context([]))).toBeUndefined();
	});

	it("leaves a scheduled publish to the scheduler, whoever's request it runs in", async () => {
		const scheduled = policy("news", entryId(1), { source: "scheduler" });
		const publish = actorStore.run(lodgeEditor, async () =>
			policyHook("publish")(scheduled, context([moved], { R1: { body: CHAPTER } })),
		);
		await expect(publish).resolves.toBeUndefined();
	});

	it("refuses to trash a body's own page from a request below Admin", async () => {
		const trash = { id: LODGE, collection: "bodies", permanent: false };
		await expect(
			actorStore.run(lodgeEditor, async () => beforeDelete(trash, context([]))),
		).resolves.toBe(false);
		await expect(beforeDelete(trash, context([]))).resolves.toBeUndefined();
	});
});
