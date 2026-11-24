import { log, messageOf } from "@adapters/log";
import { authorize, denialText, type Operation } from "@core/acl/policy";
import type { BodyId } from "@core/ids";
import {
	ContentRepository,
	MediaRepository,
	PluginStorageRepository,
	RevisionRepository,
} from "emdash";
import type { RequestActor } from "./actor-context";
import {
	entryOperation,
	MISSING_DRAFT_TEXT,
	overlayDraft,
	revisionRestoreOperation,
	scopeOf,
	stateChangeOperation,
	type EntryRow,
	type ReadEntry,
} from "./entries";
import { GRANTS, grantsOf, principalFor, type Directory } from "./grants";
import {
	idLikeSlugText,
	isAdminRole,
	looksLikeEntryId,
	parseBodyRecord,
	parseUserId,
} from "./parse";
import { ruleFor, savesEntry, type Lookup, type RouteRule } from "./route-table";

type EmDash = NonNullable<App.Locals["emdash"]>;

export interface GuardedRequest {
	/** The route Astro matched, as EmDash injected it. */
	readonly routePattern: string;
	readonly method: string;
	readonly params: Readonly<Record<string, string | undefined>>;
	readonly locale: string | undefined;
	readonly actor: RequestActor | null;
	/** The request's JSON body, or null; read only for an entry save. */
	readonly body: () => Promise<unknown>;
}

/**
 * What the guard reads from EmDash. Each read returns null when the record does not exist and
 * throws on any other failure, which the guard turns into a refusal.
 */
export interface GuardReads {
	/** findById, or findByIdIncludingTrashed when `trash`. */
	entryById(collection: string, id: string, trash: boolean): Promise<EntryRow | null>;
	/** findBySlug, or findBySlugIncludingTrashed when `trash`; no locale reads the lowest. */
	entryBySlug(
		collection: string,
		slug: string,
		locale: string | undefined,
		trash: boolean,
	): Promise<EntryRow | null>;
	revision(id: string): Promise<{
		readonly collection: string;
		readonly entryId: string;
		readonly data: Record<string, unknown>;
	} | null>;
	media(id: string): Promise<{ readonly authorId: string | null } | null>;
	readonly directory: Directory;
	bodyNames(): Promise<ReadonlyMap<BodyId, string>>;
}

export const DENIED_CODE = "BODY_ACCESS_DENIED";

const UNLISTED: Operation = { kind: "admin-only", action: "unlisted" };

/**
 * Why the guard refused before any policy decision: what it needed to read was not there, or
 * the read failed. None of these is about the user's role, so none says only an Admin can.
 */
type Stop = "no-entry" | "missing-draft" | "lookup-failed";

const STOP_TEXT: Readonly<Record<Stop, string>> = {
	"no-entry":
		"No entry matches this request, so the change was refused. Reload the page and try again.",
	"missing-draft": MISSING_DRAFT_TEXT,
	"lookup-failed":
		"The change could not be checked against your body grants, because a lookup failed, so it was refused. Try again in a moment; if it keeps failing, tell a Temple administrator.",
};

class MissingDraftError extends Error {
	override readonly name = "MissingDraftError";
}

/**
 * The middleware half of the guard: every unsafe EmDash route a signed-in non-admin calls is
 * authorized by core before EmDash runs it, including the writes no content hook sees. Returns
 * the refusal to send, or null to let the request through. Admins and anonymous requests pass:
 * Admins hold every body (FR-5.7), and EmDash refuses anonymous writes itself.
 */
export async function guardRequest(
	request: GuardedRequest,
	reads: () => GuardReads,
): Promise<Refusal | null> {
	const { actor } = request;
	if (actor === null || isAdminRole(actor.role)) return null;
	const rule = ruleFor(request.routePattern, request.method);
	if (rule === null) return null;
	const save = savesEntry(request.routePattern, request.method)
		? readSave(await request.body())
		: NO_SAVE;
	if (save.slug !== null && looksLikeEntryId(save.slug)) return idLikeSlug(save.slug);
	const from = reads();
	const ops = await operationsFor(rule, request, from, save).catch((error: unknown): Stop => {
		if (error instanceof MissingDraftError) return "missing-draft";
		log({
			event: "body_access.lookup_failed",
			route: request.routePattern,
			method: request.method,
			user: actor.id,
			error: messageOf(error),
		});
		return "lookup-failed";
	});
	if (typeof ops === "string") return denied(STOP_TEXT[ops]);
	if (ops.length === 0) return null;
	const principal = await principalFor(actor, [], from.directory);
	if (principal === null) {
		return denied("The signed-in account could not be identified, so the change was refused.");
	}
	const refusal = ops
		.map((op) => authorize(principal, op))
		.find((decision) => decision.outcome === "deny");
	return refusal?.outcome === "deny"
		? denied(denialText(refusal.reason, await from.bodyNames()))
		: null;
}

/** EmDash's reads, for one request. */
export function emdashReads(emdash: EmDash): GuardReads {
	const content = new ContentRepository(emdash.db);
	const revisions = new RevisionRepository(emdash.db);
	const media = new MediaRepository(emdash.db);
	const grants = new PluginStorageRepository(emdash.db, GRANTS.pluginId, GRANTS.collection, [
		...GRANTS.indexes,
	]);
	return {
		entryById: async (collection, id, trash) =>
			trash ? content.findByIdIncludingTrashed(collection, id) : content.findById(collection, id),
		entryBySlug: async (collection, slug, locale, trash) =>
			trash
				? content.findBySlugIncludingTrashed(collection, slug, locale)
				: content.findBySlug(collection, slug, locale),
		revision: async (id) => revisions.findById(id),
		media: async (id) => media.findById(id),
		directory: {
			grantsOf: async (user) => grantsOf(grants, user),
			// The middleware judges the actor alone; co-editors are the save hook's to check.
			roleOf: async () => null,
		},
		bodyNames: async () => bodyNames(emdash),
	};
}

/** The fields of an entry save the guard reads before EmDash does. */
interface Save {
	readonly slug: string | null;
	/** A save that sets `status` (EmDash accepts only "draft") unpublishes the entry. */
	readonly unpublishes: boolean;
}

const NO_SAVE: Save = { slug: null, unpublishes: false };

function readSave(body: unknown): Save {
	if (typeof body !== "object" || body === null) return NO_SAVE;
	const slug: unknown = Reflect.get(body, "slug");
	return {
		slug: typeof slug === "string" ? slug : null,
		unpublishes: Reflect.get(body, "status") !== undefined,
	};
}

/** A refused request: the status and EmDash-shaped error the caller gets. */
export interface Refusal {
	readonly status: 403 | 422;
	readonly code: typeof DENIED_CODE | "INVALID_SLUG";
	readonly message: string;
}

function denied(message: string): Refusal {
	return { status: 403, code: DENIED_CODE, message };
}

function idLikeSlug(slug: string): Refusal {
	return { status: 422, code: "INVALID_SLUG", message: idLikeSlugText(slug) };
}

export function refusalResponse({ status, code, message }: Refusal): Response {
	return Response.json(
		{ success: false, error: { code, message } },
		{ status, headers: { "Cache-Control": "private, no-store" } },
	);
}

async function bodyNames(emdash: EmDash): Promise<Map<BodyId, string>> {
	const result = await emdash.handleContentList("bodies", { limit: 100 });
	const items: unknown = result.success ? Reflect.get(Object(result.data), "items") : [];
	return new Map(
		(Array.isArray(items) ? items : []).flatMap((item: unknown) => {
			const id: unknown = Reflect.get(Object(item), "id");
			const body = parseBodyRecord({ id, data: Reflect.get(Object(item), "data") });
			return body === null ? [] : [[body.id, body.displayName] as const];
		}),
	);
}

/**
 * Every operation the request performs. An empty list lets the request through to EmDash, which
 * answers it (a 404, a site write, a hook-guarded write).
 */
async function operationsFor(
	rule: RouteRule,
	request: GuardedRequest,
	reads: GuardReads,
	save: Save,
): Promise<readonly Operation[] | "no-entry"> {
	const { params } = request;
	switch (rule.kind) {
		case "pass":
			return [];
		case "admin-only":
			return [{ kind: "admin-only", action: rule.action }];
		case "upload":
			return [{ kind: "upload" }];
		case "media-item": {
			// A provider's item (media/providers/[providerId]/[itemId]) records no uploader.
			if (params.id === undefined) return [{ kind: "media", uploader: null }];
			const media = await reads.media(params.id);
			return media === null ? [] : [{ kind: "media", uploader: parseUserId(media.authorId) }];
		}
		case "entry": {
			const collection = params.collection ?? "";
			const scope = scopeOf(collection);
			if (scope === "site") return [];
			if (scope === "unlisted") return [UNLISTED];
			const named = await entriesNamed(reads, rule.lookup, collection, params.id ?? "", request);
			// Refused rather than passed: a miss here must not leave EmDash to find the entry another way.
			if (named.length === 0) return "no-entry";
			const ops = named.map((entry) => entryOperation(rule.action, scope, entry));
			const unpublishes = save.unpublishes
				? named.map((entry) => stateChangeOperation("unpublish", scope, entry))
				: [];
			return [...ops, ...unpublishes];
		}
	}
	return revisionRestore(reads, params.revisionId ?? "");
}

/**
 * Every entry a route's `[id]` could name, read the way the route's EmDash handler reads it.
 * The handler tries the id or the slug first and falls back to the other, and may scope the
 * slug to the request's locale, so the guard reads all of them and authorizes each.
 */
async function entriesNamed(
	reads: GuardReads,
	lookup: Lookup,
	collection: string,
	id: string,
	request: Pick<GuardedRequest, "locale">,
): Promise<ReadEntry[]> {
	const trash = lookup !== "live";
	const slugLocales = lookup === "id" ? [] : [...new Set([undefined, request.locale])];
	const rows = await Promise.all([
		reads.entryById(collection, id, trash),
		...slugLocales.map(async (locale) => reads.entryBySlug(collection, id, locale, trash)),
	]);
	const unique = new Map(rows.flatMap((row) => (row === null ? [] : [[row.id, row] as const])));
	return Promise.all([...unique.values()].map(async (row) => withDraft(reads, row)));
}

async function withDraft(reads: GuardReads, row: EntryRow): Promise<ReadEntry> {
	const draft = row.draftRevisionId ? await reads.revision(row.draftRevisionId) : null;
	const entry = overlayDraft(row, draft);
	if (entry === null) throw new MissingDraftError(`the draft revision of ${row.id} is missing`);
	return entry;
}

async function revisionRestore(
	reads: GuardReads,
	revisionId: string,
): Promise<readonly Operation[] | "no-entry"> {
	const revision = await reads.revision(revisionId);
	if (revision === null) return [];
	const { collection, entryId, data } = revision;
	const scope = scopeOf(collection);
	if (scope === "site") return [];
	if (scope === "unlisted") return [UNLISTED];
	// EmDash restores into findById(entryId), and a recovery revision through a save that reads
	// the id or the slug, so both are checked.
	const current = await entriesNamed(reads, "live", collection, entryId, { locale: undefined });
	return current.length === 0
		? "no-entry"
		: current.map((entry) => revisionRestoreOperation(scope, entry, data));
}
