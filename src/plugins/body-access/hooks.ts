import { actorStore, type RequestActor } from "@adapters/emdash/actor-context";
import {
	saveOperation,
	scopeOf,
	storedBodies,
	targetBody,
	type StoredEntry,
} from "@adapters/emdash/entries";
import { grantsOf, principalFor, type Directory, type GrantRows } from "@adapters/emdash/grants";
import {
	parseBodyId,
	parseBodyRecord,
	parseErrorText,
	parseEventSchedule,
	parseTags,
	toStoredInstant,
	type BodyRecord,
} from "@adapters/emdash/parse";
import { checkOfficerTitle, checkTags, type RuleViolation } from "@core/acl/content-rules";
import {
	authorize,
	denialText,
	type DenyReason,
	type Operation,
	type Principal,
} from "@core/acl/policy";
import type { BodyId } from "@core/ids";
import {
	ContentSaveRejectedError,
	type ContentDeleteEvent,
	type ContentHookEvent,
	type ContentPolicyEvent,
	type MediaUploadEvent,
	type PluginContext,
} from "emdash";

const UNIDENTIFIED = "The signed-in account could not be identified, so the change was refused.";

export function grantRows(ctx: PluginContext): GrantRows {
	const rows = ctx.storage.grants;
	if (rows === undefined) throw new Error("body-access: the grants storage collection is missing");
	return rows;
}

function directory(ctx: PluginContext): Directory {
	const rows = grantRows(ctx);
	return {
		grantsOf: async (user) => grantsOf(rows, user),
		roleOf: async (user) => (await ctx.users?.get(user))?.role ?? null,
	};
}

async function principalOf(
	ctx: PluginContext,
	actor: RequestActor | undefined | null,
	editedBy: readonly string[] = [],
): Promise<Principal | null> {
	// No actor: a scheduled publish, a plugin or a system write (policy D2).
	if (!actor) return { kind: "internal", origin: "system" };
	return principalFor(actor, editedBy, directory(ctx));
}

/** An entry with its draft's values over the live ones, as EmDash's own routes read it. */
export async function readEntry(
	ctx: PluginContext,
	collection: string,
	id: string,
): Promise<(StoredEntry & { readonly data: Record<string, unknown> }) | null> {
	const live = await ctx.content?.get(collection, id);
	if (!live) return null;
	const draftId = live.draftRevisionId;
	const draft = draftId ? await ctx.content?.getRevision?.(collection, live.id, draftId) : null;
	if (!draft) return { id: live.id, data: live.data };
	const staged = Object.entries(draft.data).filter(([key]) => !key.startsWith("_"));
	return {
		id: live.id,
		data: { ...live.data, ...Object.fromEntries(staged) },
		liveData: live.data,
	};
}

export async function bodyRecords(ctx: PluginContext): Promise<BodyRecord[]> {
	const page = await ctx.content?.list("bodies", { limit: 100 });
	return (page?.items ?? []).flatMap((item) => parseBodyRecord(item) ?? []);
}

async function denial(ctx: PluginContext, reason: DenyReason | RuleViolation): Promise<string> {
	const names = new Map((await bodyRecords(ctx)).map((body) => [body.id, body.displayName]));
	return denialText(reason, names);
}

async function refusal(
	ctx: PluginContext,
	principal: Principal | null,
	op: Operation,
): Promise<string | null> {
	if (principal === null) return UNIDENTIFIED;
	const decision = authorize(principal, op);
	return decision.outcome === "deny" ? denial(ctx, decision.reason) : null;
}

/**
 * FR-5.2, 5.3, 5.5, 5.6, 5.8 and the save-time content rules (FR-2.1, 3.2, 4.2). Returns the
 * content with `body` set when FR-5.5 assigns it.
 */
export async function beforeSave(
	event: ContentHookEvent,
	ctx: PluginContext,
): Promise<Record<string, unknown> | void> {
	const scope = scopeOf(event.collection);
	if (scope === "site") return;
	const principal = await principalOf(ctx, event.actor, event.editedBy);
	if (principal === null) throw new ContentSaveRejectedError(UNIDENTIFIED);
	const existing =
		event.isNew || event.id === undefined ? null : await readEntry(ctx, event.collection, event.id);
	const saved = { ...existing?.data, ...event.content };
	const op = saveOperation(scope, existing, saved);
	const decision = op === null ? null : authorize(principal, op);
	if (decision?.outcome === "deny") {
		throw new ContentSaveRejectedError(await denial(ctx, decision.reason));
	}
	await guardTranslationSource(event, principal, ctx);
	if (scope !== "body-field") return;

	const body = decision?.outcome === "assign" ? decision.body : parseBodyId(saved.body);
	if (body !== null) await checkContentRules(event.collection, saved, body, ctx);
	return decision?.outcome === "assign" ? { ...event.content, body } : undefined;
}

/** A translation joins its source's group, so it needs the grants the source does. */
async function guardTranslationSource(
	event: ContentHookEvent,
	principal: Principal,
	ctx: PluginContext,
): Promise<void> {
	const scope = scopeOf(event.collection);
	if (event.translationOf === undefined || (scope !== "body-field" && scope !== "self")) return;
	const source = await readEntry(ctx, event.collection, event.translationOf);
	if (source === null) return;
	const op: Operation = {
		kind: "update",
		from: storedBodies(scope, source),
		to: targetBody(scope, source),
	};
	const text = await refusal(ctx, principal, op);
	if (text !== null) throw new ContentSaveRejectedError(text);
}

async function checkContentRules(
	collection: string,
	saved: Readonly<Record<string, unknown>>,
	body: BodyId,
	ctx: PluginContext,
): Promise<void> {
	const entry = await readEntry(ctx, "bodies", body);
	const record = entry === null ? null : parseBodyRecord(entry);
	if (record === null) {
		throw new ContentSaveRejectedError(
			`${body} is not one of the Temple's bodies. Choose the body this entry belongs to.`,
		);
	}
	const violation = contentRuleViolation(collection, saved, record);
	if (violation !== null) throw new ContentSaveRejectedError(violation);
}

/** FR-3.2 tags, FR-2.1 officer titles and FR-4.2 recurrence, as plain text when broken. */
function contentRuleViolation(
	collection: string,
	saved: Readonly<Record<string, unknown>>,
	body: BodyRecord,
): string | null {
	const names = new Map([[body.id, body.displayName]]);
	if (collection === "news") {
		const tags = parseTags(saved.tags);
		if (!tags.ok) return parseErrorText(tags.error);
		const checked = checkTags(tags.value, body.vocabulary, body.id);
		return checked.ok ? null : denialText(checked.error, names);
	}
	if (collection === "officers") {
		if (typeof saved.title !== "string" || body.bodyType === null) return null;
		const checked = checkOfficerTitle(saved.title, body.bodyType);
		return checked.ok ? null : denialText(checked.error, names);
	}
	if (collection === "events" && typeof saved.rrule === "string" && saved.rrule.trim() !== "") {
		const schedule = parseEventSchedule({
			...saved,
			start: toStoredInstant(saved.start),
			end: toStoredInstant(saved.end),
		});
		return schedule.ok ? null : parseErrorText(schedule.error);
	}
	return null;
}

/**
 * FR-5.4 trash. A backstop: src/middleware.ts refuses an API trash first, with a readable
 * reason, because EmDash turns `false` here into a bare DELETE_BLOCKED. The event carries no
 * actor, so it comes from the request's actor store.
 */
export async function beforeDelete(
	event: ContentDeleteEvent,
	ctx: PluginContext,
): Promise<boolean | void> {
	const actor = actorStore.getStore();
	const scope = scopeOf(event.collection);
	if (!actor || scope === "site") return;
	const entry = scope === "unlisted" ? null : await readEntry(ctx, event.collection, event.id);
	const op: Operation =
		scope === "unlisted"
			? { kind: "admin-only", action: "unlisted" }
			: { kind: "delete", bodies: entry === null ? [] : storedBodies(scope, entry) };
	return (await refusal(ctx, await principalOf(ctx, actor), op)) === null ? undefined : false;
}

/** FR-5.4 publish, unpublish and schedule. Publish and schedule check the live and draft body. */
export function policyHook(kind: "publish" | "unpublish" | "schedule") {
	return async (
		event: ContentPolicyEvent,
		ctx: PluginContext,
	): Promise<{ cancel: true; reason: string } | void> => {
		const scope = scopeOf(event.collection);
		if (!event.actor || scope === "site") return;
		const { id, data, liveData } = event.content;
		const op: Operation =
			scope === "unlisted"
				? { kind: "admin-only", action: "unlisted" }
				: { kind, bodies: storedBodies(scope, { id, data, liveData }) };
		const text = await refusal(ctx, await principalOf(ctx, event.actor), op);
		return text === null ? undefined : { cancel: true, reason: text };
	};
}

/** ADR-002 O1 backstop: the middleware refuses an upload by a user with no grant first. */
export async function beforeUpload(_event: MediaUploadEvent, ctx: PluginContext): Promise<void> {
	const actor = actorStore.getStore();
	if (!actor) return;
	const text = await refusal(ctx, await principalOf(ctx, actor), { kind: "upload" });
	if (text !== null) throw new Error(text);
}
