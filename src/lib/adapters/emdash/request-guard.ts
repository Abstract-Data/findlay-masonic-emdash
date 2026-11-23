import { authorize, denialText, type Operation } from "@core/acl/policy";
import type { BodyId } from "@core/ids";
import { PluginStorageRepository } from "emdash";
import type { RequestActor } from "./actor-context";
import { entryOperation, revisionRestoreOperation, scopeOf, type StoredEntry } from "./entries";
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
	const op = await operationFor(rule, request, emdash);
	if (op === null) return null;
	const principal = await principalFor(actor, [], directory(emdash));
	if (principal === null) {
		return denied("The signed-in account could not be identified, so the change was refused.");
	}
	const decision = authorize(principal, op);
	return decision.outcome === "deny"
		? denied(denialText(decision.reason, await bodyNames(emdash)))
		: null;
}

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

/** Null lets the request through: EmDash answers it (a 404, a site write, a hook-guarded write). */
async function operationFor(
	rule: RouteRule,
	request: GuardedRequest,
	emdash: EmDash,
): Promise<Operation | null> {
	const { params } = request;
	switch (rule.kind) {
		case "pass":
			return null;
		case "admin-only":
			return { kind: "admin-only", action: rule.action };
		case "upload":
			return { kind: "upload" };
		case "media-item": {
			const media = await emdash.handleMediaGet(params.id ?? "");
			return media.success
				? { kind: "media", uploader: parseUserId(media.data.item.authorId) }
				: null;
		}
		case "entry": {
			const collection = params.collection ?? "";
			const scope = scopeOf(collection);
			if (scope === "site") return null;
			if (scope === "unlisted") return { kind: "admin-only", action: "unlisted" };
			const id = params.id ?? "";
			const found = entryOf(
				rule.action === "restore"
					? await emdash.handleContentGetIncludingTrashed(collection, id)
					: await emdash.handleContentGet(collection, id, request.locale),
			);
			return found === null ? null : entryOperation(rule.action, scope, found);
		}
	}
	return revisionRestore(params.revisionId ?? "", emdash);
}

async function revisionRestore(revisionId: string, emdash: EmDash): Promise<Operation | null> {
	const revision = await emdash.handleRevisionGet(revisionId);
	if (!revision.success) return null;
	const { collection, entryId, data } = revision.data.item;
	const scope = scopeOf(collection);
	if (scope === "site") return null;
	if (scope === "unlisted") return { kind: "admin-only", action: "unlisted" };
	const current = entryOf(await emdash.handleContentGet(collection, entryId));
	return current === null ? null : revisionRestoreOperation(scope, current, data);
}
