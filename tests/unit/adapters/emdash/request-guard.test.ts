import type { RequestActor } from "@adapters/emdash/actor-context";
import type { EntryRow } from "@adapters/emdash/entries";
import {
	guardRequest,
	refusalResponse,
	type GuardReads,
	type GuardedRequest,
} from "@adapters/emdash/request-guard";
import type { BodyId } from "@core/ids";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, entryId } from "../../fixtures";

const NAMES = new Map<BodyId, string>([
	[LODGE, "Findlay Lodge No. 227"],
	[CHAPTER, "Findlay Chapter No. 58"],
]);

interface Stored {
	readonly id: string;
	readonly collection?: string;
	readonly slug?: string;
	readonly locale?: string;
	readonly body: BodyId;
	readonly trashed?: boolean;
	/** The body a pending draft moves the entry to; `missing` when the draft cannot be read. */
	readonly draft?: BodyId | "missing";
}

interface World {
	readonly entries?: readonly Stored[];
	readonly revisions?: Readonly<Record<string, { entryId: string; body: BodyId }>>;
	readonly media?: Readonly<Record<string, string | null>>;
	readonly mediaFails?: boolean;
}

const GRANTS: Readonly<Record<string, readonly BodyId[]>> = {
	"lodge-editor": [LODGE],
	"two-body-editor": [LODGE, CHAPTER],
};

const lodgeEditor: RequestActor = { id: "lodge-editor", role: 40 };

const row = (entry: Stored): EntryRow => ({
	id: entry.id,
	data: { body: entry.body },
	draftRevisionId: entry.draft === undefined ? null : `draft-${entry.id}`,
});

function reads(world: World): GuardReads {
	const entries = world.entries ?? [];
	const visible = (collection: string, trash: boolean) =>
		entries.filter((e) => (e.collection ?? "news") === collection && (trash || !e.trashed));
	return {
		entryById: async (collection, id, trash) => {
			const found = visible(collection, trash).find((e) => e.id === id);
			return found === undefined ? null : row(found);
		},
		entryBySlug: async (collection, slug, locale, trash) => {
			const found = visible(collection, trash)
				.filter((e) => e.slug === slug && (locale === undefined || e.locale === locale))
				.toSorted((a, b) => (a.locale ?? "en").localeCompare(b.locale ?? "en"))[0];
			return found === undefined ? null : row(found);
		},
		revision: async (id) => {
			const drafted = entries.find((e) => `draft-${e.id}` === id);
			if (drafted !== undefined) {
				return drafted.draft === "missing" || drafted.draft === undefined
					? null
					: { collection: "news", entryId: drafted.id, data: { body: drafted.draft } };
			}
			const revision = world.revisions?.[id];
			return revision === undefined
				? null
				: { collection: "news", entryId: revision.entryId, data: { body: revision.body } };
		},
		media: async (id) => {
			if (world.mediaFails === true) throw new Error("D1_ERROR: database is locked");
			const authorId = world.media?.[id];
			return authorId === undefined ? null : { authorId };
		},
		directory: {
			grantsOf: async (user) => new Set(GRANTS[user] ?? []),
			roleOf: async () => null,
		},
		bodyNames: async () => NAMES,
	};
}

const CONTENT = "/_emdash/api/content/[collection]";
const ENTRY = `${CONTENT}/[id]`;

function request(
	routePattern: string,
	method: string,
	params: Record<string, string>,
	more: Partial<GuardedRequest> = {},
): GuardedRequest {
	return {
		routePattern,
		method,
		params: { collection: "news", ...params },
		locale: undefined,
		actor: lodgeEditor,
		body: async () => null,
		...more,
	};
}

async function guard(req: GuardedRequest, world: World) {
	const refusal = await guardRequest(req, () => reads(world));
	if (refusal === null) return null;
	const response = refusalResponse(refusal);
	const body: unknown = await response.json();
	const error: unknown = Reflect.get(Object(body), "error");
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	return {
		status: response.status,
		code: String(Reflect.get(Object(error), "code")),
		message: String(Reflect.get(Object(error), "message")),
	};
}

const chapterRefusal = {
	status: 403,
	code: "BODY_ACCESS_DENIED",
	message: expect.stringContaining("Findlay Chapter No. 58"),
};

describe("guardRequest: every entry a route's [id] could name (ADR-002, red team 1)", () => {
	const trashedChapter: Stored = { id: entryId(1), body: CHAPTER, trashed: true };
	const decoy: Stored = { id: entryId(2), slug: entryId(1), body: LODGE };

	it("refuses a recovery revision that names a trashed Chapter entry by id, past a Lodge slug", async () => {
		const req = request(`${ENTRY}/revisions`, "POST", { id: entryId(1) });
		expect(await guard(req, { entries: [trashedChapter, decoy] })).toEqual(chapterRefusal);
	});

	it("refuses a recovery revision whose slug is also a trashed Chapter entry's, in another locale", async () => {
		const entries: Stored[] = [
			{ id: entryId(1), slug: "shared", locale: "aa", body: CHAPTER, trashed: true },
			{ id: entryId(2), slug: "shared", locale: "en", body: LODGE },
		];
		const req = request(`${ENTRY}/revisions`, "POST", { id: "shared" });
		expect(await guard(req, { entries })).toEqual(chapterRefusal);
	});

	it("lets a route that skips the trash ignore a trashed entry that shares the slug", async () => {
		const entries: Stored[] = [
			{ id: entryId(1), slug: "shared", locale: "aa", body: CHAPTER, trashed: true },
			{ id: entryId(2), slug: "shared", locale: "en", body: LODGE },
		];
		expect(await guard(request(ENTRY, "PUT", { id: "shared" }), { entries })).toBeNull();
	});

	it("checks the slug with and without the request's locale", async () => {
		const entries: Stored[] = [
			{ id: entryId(1), slug: "minutes", locale: "en", body: LODGE },
			{ id: entryId(2), slug: "minutes", locale: "fr", body: CHAPTER },
		];
		const inFrench = request(ENTRY, "DELETE", { id: "minutes" }, { locale: "fr" });
		expect(await guard(inFrench, { entries })).toEqual(chapterRefusal);
		const inEnglish = request(ENTRY, "DELETE", { id: "minutes" }, { locale: "en" });
		expect(await guard(inEnglish, { entries })).toBeNull();
		// Duplicate ignores the locale, so a locale the entry is not in still names it.
		const agenda: Stored = { id: entryId(3), slug: "agenda", locale: "en", body: CHAPTER };
		const elsewhere = request(`${ENTRY}/duplicate`, "POST", { id: "agenda" }, { locale: "zz" });
		expect(await guard(elsewhere, { entries: [agenda] })).toEqual(chapterRefusal);
	});

	it("lets the Lodge write its own trashed entry", async () => {
		const own: Stored = { id: entryId(3), body: LODGE, trashed: true };
		const req = request(`${ENTRY}/restore`, "POST", { id: entryId(3) });
		expect(await guard(req, { entries: [own] })).toBeNull();
	});

	it("reads a scheduled-rejection key by id alone, trash included", async () => {
		const rejection = "/_emdash/api/admin/scheduled-policy-rejections/[collection]/[id]";
		const req = request(rejection, "DELETE", { id: entryId(1) });
		expect(await guard(req, { entries: [trashedChapter, decoy] })).toEqual(chapterRefusal);
	});

	it("refuses a request that names no entry, so EmDash cannot find one another way", async () => {
		const refusal = await guard(request(ENTRY, "PUT", { id: "nothing" }), {});
		expect(refusal).toMatchObject({
			status: 403,
			message: expect.stringContaining("No entry matches this request"),
		});
		expect(refusal?.message).not.toContain("Only a Temple administrator can");
	});

	it("checks every entry a restored revision's entry id could name", async () => {
		const revisions = { R1: { entryId: entryId(1), body: LODGE } };
		const chapterEntry: Stored = { id: entryId(1), body: CHAPTER };
		const req = request("/_emdash/api/revisions/[revisionId]/restore", "POST", {
			revisionId: "R1",
		});
		expect(await guard(req, { entries: [chapterEntry], revisions })).toEqual(chapterRefusal);
	});
});

describe("guardRequest: pending drafts (red team 3 and 7)", () => {
	it("refuses an unpublish when a pending draft moves the entry to the Chapter", async () => {
		const moved: Stored = { id: entryId(1), body: LODGE, draft: CHAPTER };
		const req = request(`${ENTRY}/unpublish`, "POST", { id: entryId(1) });
		expect(await guard(req, { entries: [moved] })).toEqual(chapterRefusal);
		const staying: Stored = { id: entryId(1), body: LODGE, draft: LODGE };
		expect(await guard(req, { entries: [staying] })).toBeNull();
	});

	it("refuses a write when the entry's pending draft is missing, and says to discard it", async () => {
		const unreadable: Stored = { id: entryId(1), body: LODGE, draft: "missing" };
		const refusal = await guard(request(ENTRY, "PUT", { id: entryId(1) }), {
			entries: [unreadable],
		});
		expect(refusal).toMatchObject({
			status: 403,
			message: expect.stringContaining("Choose Discard changes on the entry"),
		});
		expect(refusal?.message).not.toContain("Only a Temple administrator can");
	});
});

describe("guardRequest: saves (red team 1 defense in depth, 4)", () => {
	const own: Stored = { id: entryId(1), body: LODGE };

	it("refuses a slug that EmDash would read as an entry id, with a plain reason", async () => {
		const saves = [
			[CONTENT, "POST", {}],
			[ENTRY, "PUT", { id: entryId(1) }],
			[`${ENTRY}/revisions`, "POST", { id: entryId(1) }],
		] as const;
		const refusals = await Promise.all(
			saves.map(async ([pattern, method, params]) =>
				guard(request(pattern, method, params, { body: async () => ({ slug: entryId(9) }) }), {
					entries: [own],
				}),
			),
		);
		expect(refusals).toEqual(
			saves.map(() => ({
				status: 422,
				code: "INVALID_SLUG",
				message: expect.stringContaining("looks like an entry id"),
			})),
		);
		const words = request(
			ENTRY,
			"PUT",
			{ id: entryId(1) },
			{
				body: async () => ({ slug: "spring-banquet" }),
			},
		);
		expect(await guard(words, { entries: [own] })).toBeNull();
	});

	it("treats a save that sets the status as an unpublish, which a body's own page leaves to Admins", async () => {
		const page: Stored = { id: LODGE, collection: "bodies", body: LODGE };
		const unpublish = request(
			ENTRY,
			"PUT",
			{ collection: "bodies", id: LODGE },
			{
				body: async () => ({ status: "draft" }),
			},
		);
		expect(await guard(unpublish, { entries: [page] })).toMatchObject({
			status: 403,
			message: expect.stringContaining("cannot trash, unpublish or schedule a body's page"),
		});
		const edit = request(
			ENTRY,
			"PUT",
			{ collection: "bodies", id: LODGE },
			{
				body: async () => ({ data: { schedule_note: "Second Tuesday" } }),
			},
		);
		expect(await guard(edit, { entries: [page] })).toBeNull();
		const news = request(
			ENTRY,
			"PUT",
			{ id: entryId(1) },
			{ body: async () => ({ status: "draft" }) },
		);
		expect(await guard(news, { entries: [own] })).toBeNull();
	});

	it("leaves trashing a body's own page to Admins", async () => {
		const page: Stored = { id: LODGE, collection: "bodies", body: LODGE };
		const trash = request(ENTRY, "DELETE", { collection: "bodies", id: LODGE });
		expect(await guard(trash, { entries: [page] })).toMatchObject({ status: 403 });
		expect(
			await guard({ ...trash, actor: { id: "admin", role: 50 } }, { entries: [page] }),
		).toBeNull();
	});
});

const item = (id: string) => request("/_emdash/api/media/[id]", "PUT", { id });

describe("guardRequest: media items (ADR-002 O1, red team 5)", () => {
	it("lets the uploader through and refuses anyone else", async () => {
		const media = { M1: "lodge-editor", M2: "chapter-editor" };
		expect(await guard(item("M1"), { media })).toBeNull();
		expect(await guard(item("M2"), { media })).toMatchObject({
			status: 403,
			message: expect.stringContaining("did not upload this file"),
		});
	});

	it("passes a missing item to EmDash, which answers 404", async () => {
		expect(await guard(item("M9"), { media: {} })).toBeNull();
	});

	it("refuses when the item cannot be read, rather than letting the change through", async () => {
		expect(await guard(item("M1"), { mediaFails: true })).toMatchObject({ status: 403 });
	});

	it("says a failed lookup could not be checked, not that only an Admin may (parked a)", async () => {
		const refusal = await guard(item("M1"), { mediaFails: true });
		expect(refusal).toEqual({
			status: 403,
			code: "BODY_ACCESS_DENIED",
			message: expect.stringContaining("could not be checked against your body grants"),
		});
		expect(refusal?.message).not.toContain("Only a Temple administrator can");
	});
});

describe("guardRequest: routes that name no entry", () => {
	it("passes a site-wide write, refuses MCP, and needs a grant to upload", async () => {
		expect(await guard(request("/_emdash/api/menus", "POST", {}), {})).toBeNull();
		expect(await guard(request("/_emdash/api/mcp", "POST", {}), {})).toMatchObject({
			status: 403,
			message: expect.stringContaining("cannot use the MCP endpoint"),
		});
		const upload = request("/_emdash/api/media", "POST", {});
		expect(await guard(upload, {})).toBeNull();
		expect(await guard({ ...upload, actor: { id: "new-editor", role: 40 } }, {})).toMatchObject({
			status: 403,
			message: expect.stringContaining("has no body grants"),
		});
	});
});

describe("guardRequest: who it judges", () => {
	it("passes Admins and anonymous requests, which EmDash judges itself", async () => {
		const chapterEntry: Stored = { id: entryId(1), body: CHAPTER };
		const req = request(ENTRY, "DELETE", { id: entryId(1) });
		expect(await guard({ ...req, actor: null }, { entries: [chapterEntry] })).toBeNull();
		expect(
			await guard({ ...req, actor: { id: "admin", role: 50 } }, { entries: [chapterEntry] }),
		).toBeNull();
		expect(await guard(req, { entries: [chapterEntry] })).toEqual(chapterRefusal);
	});
});
