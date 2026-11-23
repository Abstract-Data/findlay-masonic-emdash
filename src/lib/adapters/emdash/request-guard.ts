import { authorize, denialText, type Operation } from "@core/acl/policy";
import type { BodyId } from "@core/ids";
import { PluginStorageRepository } from "emdash";
import type { RequestActor } from "./actor-context";
import {
	entryOperation,
	revisionRestoreOperation,
	scopeOf,
	type EntryAction,
	type StoredEntry,
} from "./entries";
import { GRANTS, grantsOf, principalFor, type Directory } from "./grants";
import { isAdminRole, parseBodyRecord, parseUserId } from "./parse";
import { ruleFor, type RouteRule } from "./route-table";

type EmDash = App.Locals["emdash"];

export interface GuardedRequest {
	/** The route Astro matched, as EmDash injected it. */
	readonly routePattern: string;
	readonly method: string;
	readonly params: Readonly<Record<string, string | undefined>>;
	readonly locale: string | undefined;
	readonly actor: RequestActor | null;
	readonly emdash: EmDash | undefined;
}

export const DENIED_CODE = "BODY_ACCESS_DENIED";

/**
 * The middleware half of the guard: every unsafe EmDash route a signed-in non-admin calls is
 * authorized by core before EmDash runs it, including the writes no content hook sees. Returns
 * the 403 to send, or null to let the request through. Admins and anonymous requests pass:
 * Admins hold every body (FR-5.7), and EmDash refuses anonymous writes itself.
 */
export async function guardRequest(request: GuardedRequest): Promise<Response | null> {
	const { actor, emdash } = request;
	if (actor === null || isAdminRole(actor.role) || emdash === undefined) return null;
	const rule = ruleFor(request.routePattern, request.method);
	if (rule === null) return null;
	const ops = await operationsFor(rule, request, emdash);
	if (ops.length === 0) return null;
	const principal = await principalFor(actor, [], directory(emdash));
	if (principal === null) {
		return denied("The signed-in account could not be identified, so the change was refused.");
	}
	const refusal = ops
		.map((op) => authorize(principal, op))
		.find((decision) => decision.outcome === "deny");
	return refusal?.outcome === "deny"
		? denied(denialText(refusal.reason, await bodyNames(emdash)))
		: null;
}

const UNLISTED: Operation = { kind: "admin-only", action: "unlisted" };

function denied(message: string): Response {
	return Response.json(
		{ success: false, error: { code: DENIED_CODE, message } },
		{ status: 403, headers: { "Cache-Control": "private, no-store" } },
	);
}

function directory(emdash: EmDash): Directory {
	const rows = new PluginStorageRepository(emdash.db, GRANTS.pluginId, GRANTS.collection, [
		...GRANTS.indexes,
	]);
	return {
		grantsOf: async (user) => grantsOf(rows, user),
		// The middleware judges the actor alone; co-editors are the save hook's to check.
		roleOf: async () => null,
	};
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

function entryOf(result: { success: boolean; data?: unknown }): StoredEntry | null {
	if (!result.success) return null;
	const found: unknown = Reflect.get(Object(result.data), "item");
	return typeof found === "object" && found !== null
		? {
				id: Reflect.get(found, "id"),
				data: Reflect.get(found, "data"),
				liveData: Reflect.get(found, "liveData"),
			}
		: null;
}

/**
 * Every operation the request performs; none lets it through, and EmDash answers it (a 404, a
 * site write, a hook-guarded write).
 */
async function operationsFor(
	rule: RouteRule,
	request: GuardedRequest,
	emdash: EmDash,
): Promise<readonly Operation[]> {
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
			const media = await emdash.handleMediaGet(params.id);
			return media.success
				? [{ kind: "media", uploader: parseUserId(media.data.item.authorId) }]
				: [];
		}
		case "entry": {
			const collection = params.collection ?? "";
			const scope = scopeOf(collection);
			if (scope === "site") return [];
			if (scope === "unlisted") return [UNLISTED];
			const found = await entriesNamed(rule.action, collection, params.id ?? "", request, emdash);
			// Refused rather than passed: a miss here must not leave EmDash to find the entry another way.
			if (found.length === 0) return [UNLISTED];
			return found.map((entry) => entryOperation(rule.action, scope, entry));
		}
	}
	return revisionRestore(params.revisionId ?? "", emdash);
}

/**
 * The entries a route could act on. Some EmDash routes resolve a slug in the request's locale
 * and some ignore it, so both readings are checked.
 */
async function entriesNamed(
	action: EntryAction,
	collection: string,
	id: string,
	request: GuardedRequest,
	emdash: EmDash,
): Promise<StoredEntry[]> {
	const readings =
		action === "restore"
			? [emdash.handleContentGetIncludingTrashed(collection, id)]
			: [
					emdash.handleContentGet(collection, id, request.locale),
					...(request.locale === undefined ? [] : [emdash.handleContentGet(collection, id)]),
				];
	return (await Promise.all(readings)).flatMap((result) => entryOf(result) ?? []);
}

async function revisionRestore(revisionId: string, emdash: EmDash): Promise<readonly Operation[]> {
	const revision = await emdash.handleRevisionGet(revisionId);
	if (!revision.success) return [];
	const { collection, entryId, data } = revision.data.item;
	const scope = scopeOf(collection);
	if (scope === "site") return [];
	if (scope === "unlisted") return [UNLISTED];
	const current = entryOf(await emdash.handleContentGet(collection, entryId));
	return current === null ? [UNLISTED] : [revisionRestoreOperation(scope, current, data)];
}
