import { actorStore, type RequestActor } from "@adapters/emdash/actor-context";
import {
	MISSING_DRAFT_TEXT,
	overlayDraft,
	saveOperation,
	scopeOf,
	stateChangeOperation,
	storedBodies,
	targetBody,
	type EntryRow,
	type ReadEntry,
} from "@adapters/emdash/entries";
import { grantsOf, principalFor, type Directory, type GrantRows } from "@adapters/emdash/grants";
import { log } from "@adapters/log";
import {
	idLikeSlugText,
	isAdminRole,
	looksLikeEntryId,
	parseBodyId,
	parseBodyRecord,
	parseErrorText,
	parseEventSchedule,
	parseTags,
	toStoredInstant,
	type BodyRecord,
} from "@adapters/emdash/parse";
import {
	checkOfficerTitle,
	checkTags,
	checkTranslationBody,
	type RuleViolation,
} from "@core/acl/content-rules";
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
	isContentSaveRejection,
	type ContentDeleteEvent,
	type ContentHookEvent,
	type ContentPolicyEvent,
	type MediaUploadEvent,
} from "emdash";

const UNIDENTIFIED = "The signed-in account could not be identified, so the change was refused.";
const UNLISTED: Operation = { kind: "admin-only", action: "unlisted" };

/** The slice of EmDash's plugin context the hooks and routes read; PluginContext fits it. */
export interface HookContext {
	readonly content?: {
		get(collection: string, id: string): Promise<EntryRow | null>;
		list(
			collection: string,
			options: { limit: number },
		): Promise<{ readonly items: readonly { readonly id: string; readonly data: unknown }[] }>;
		getRevision?(
			collection: string,
			id: string,
			revisionId: string,
		): Promise<{ readonly data: Record<string, unknown> } | null>;
	};
	readonly storage: { readonly grants?: GrantRows };
	readonly users?: { get(id: string): Promise<{ readonly role: number } | null> };
}

export function grantRows(ctx: HookContext): GrantRows {
	const rows = ctx.storage.grants;
	if (rows === undefined) throw new Error("body-access: the grants storage collection is missing");
	return rows;
}

function directory(ctx: HookContext): Directory {
	const rows = grantRows(ctx);
	return {
		grantsOf: async (user) => grantsOf(rows, user),
		roleOf: async (user) => (await ctx.users?.get(user))?.role ?? null,
	};
}

/**
 * Who a write acts for: the event's actor, else the signed-in user of the request it runs in,
 * so a plugin writing on a user's behalf is held to that user's grants. Null only outside any
 * signed-in request: a scheduled publish, a seed or a system write (policy D2).
 */
function actorOf(eventActor?: RequestActor): RequestActor | null {
	return eventActor ?? actorStore.getStore() ?? null;
}

async function principalOf(
	ctx: HookContext,
	actor: RequestActor | null,
	editedBy: readonly string[] = [],
): Promise<Principal | null> {
	if (actor === null) return { kind: "internal", origin: "system" };
	return principalFor(actor, editedBy, directory(ctx));
}

/** An entry with its draft's values over the live ones, as EmDash's own routes read it. */
export async function readEntry(
	ctx: HookContext,
	collection: string,
	id: string,
): Promise<ReadEntry | null> {
	const live = await ctx.content?.get(collection, id);
	if (!live) return null;
	const draftId = live.draftRevisionId;
	const draft = draftId
		? ((await ctx.content?.getRevision?.(collection, live.id, draftId)) ?? null)
		: null;
	const entry = overlayDraft(live, draft);
	if (entry === null) throw new ContentSaveRejectedError(MISSING_DRAFT_TEXT);
	return entry;
}

export async function bodyRecords(ctx: HookContext): Promise<BodyRecord[]> {
	const page = await ctx.content?.list("bodies", { limit: 100 });
	return (page?.items ?? []).flatMap((item) => parseBodyRecord(item) ?? []);
}

async function denial(ctx: HookContext, reason: DenyReason | RuleViolation): Promise<string> {
	const names = new Map((await bodyRecords(ctx)).map((body) => [body.id, body.displayName]));
	return denialText(reason, names);
}

async function refusal(
	ctx: HookContext,
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
	ctx: HookContext,
): Promise<Record<string, unknown> | void> {
	const scope = scopeOf(event.collection);
	if (scope === "site") return;
	const principal = await principalOf(ctx, actorOf(event.actor), event.editedBy);
	if (principal === null) throw new ContentSaveRejectedError(UNIDENTIFIED);
	const existing =
		event.isNew || event.id === undefined ? null : await readEntry(ctx, event.collection, event.id);
	const saved = { ...existing?.data, ...event.content };
	const op = saveOperation(scope, existing, saved);
	const decision = op === null ? null : authorize(principal, op);
	if (decision?.outcome === "deny") {
		throw new ContentSaveRejectedError(await denial(ctx, decision.reason));
	}
	const body = decision?.outcome === "assign" ? decision.body : parseBodyId(saved.body);
	await guardTranslationSource(event, principal, scope === "body-field" ? body : null, ctx);
	if (scope !== "body-field") return;

	if (body !== null) await checkContentRules(event.collection, saved, body, ctx);
	return decision?.outcome === "assign" ? { ...event.content, body } : undefined;
}

/**
 * A translation joins its source's group, so it needs the grants the source does, and it
 * belongs to the source's body.
 */
async function guardTranslationSource(
	event: ContentHookEvent,
	principal: Principal,
	body: BodyId | null,
	ctx: HookContext,
): Promise<void> {
	const scope = scopeOf(event.collection);
	if (event.translationOf === undefined || (scope !== "body-field" && scope !== "self")) return;
	const source = await readEntry(ctx, event.collection, event.translationOf);
	if (source === null) return;
	const sourceBody = targetBody(scope, source);
	const op: Operation = { kind: "update", from: storedBodies(scope, source), to: sourceBody };
	const text = await refusal(ctx, principal, op);
	if (text !== null) throw new ContentSaveRejectedError(text);
	const same = body === null || sourceBody === null ? null : checkTranslationBody(body, sourceBody);
	if (same?.ok === false) throw new ContentSaveRejectedError(await denial(ctx, same.error));
}

async function checkContentRules(
	collection: string,
	saved: Readonly<Record<string, unknown>>,
	body: BodyId,
	ctx: HookContext,
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

/** The operation a state change performs on the entry as it is stored now; null on a site page. */
async function stateChange(
	ctx: HookContext,
	change: "delete" | "publish" | "unpublish" | "schedule",
	collection: string,
	id: string,
): Promise<Operation | null> {
	const scope = scopeOf(collection);
	if (scope === "site") return null;
	if (scope === "unlisted") return UNLISTED;
	return stateChangeOperation(change, scope, (await readEntry(ctx, collection, id)) ?? { id });
}

/**
 * FR-5.4 trash. A backstop: src/middleware.ts refuses an API trash first, with a readable
 * reason, because EmDash turns `false` here into a bare DELETE_BLOCKED. The event carries no
 * actor, so it comes from the request's actor store.
 */
export async function beforeDelete(
	event: ContentDeleteEvent,
	ctx: HookContext,
): Promise<boolean | void> {
	const actor = actorOf();
	const op = actor === null ? null : await stateChange(ctx, "delete", event.collection, event.id);
	if (op === null) return;
	return (await refusal(ctx, await principalOf(ctx, actor), op)) === null ? undefined : false;
}

/**
 * ADR-002 risk 9, below Admin: a slug shaped like an entry id. The middleware refuses one in a
 * save request, but a co-editing room's checkpoint saves through EmDash without a request the
 * middleware sees, and content:beforeSave is never handed the slug: EmDash stages it on the draft
 * revision as `_slug` after the hooks run. A staged slug goes live only when the draft is
 * published, so publishing and scheduling are where it is refused.
 */
async function idLikeStagedSlug(
	ctx: HookContext,
	actor: RequestActor,
	collection: string,
	id: string,
): Promise<string | null> {
	if (isAdminRole(actor.role)) return null;
	const slug = (await readEntry(ctx, collection, id))?.stagedSlug;
	return slug !== undefined && looksLikeEntryId(slug) ? idLikeSlugText(slug) : null;
}

/**
 * FR-5.4 publish, unpublish and schedule, against the live and the draft body. EmDash hands
 * beforeUnpublish the live entry only, so each hook reads the entry itself.
 */
export function policyHook(change: "publish" | "unpublish" | "schedule") {
	return async (
		event: ContentPolicyEvent,
		ctx: HookContext,
	): Promise<{ cancel: true; reason: string } | void> => {
		const { source } = event.origin;
		const actor = source === "scheduler" || source === "system" ? null : actorOf(event.actor);
		const id = typeof event.content.id === "string" ? event.content.id : "";
		if (actor !== null && change !== "unpublish") {
			const slug = await idLikeStagedSlug(ctx, actor, event.collection, id);
			if (slug !== null) return { cancel: true, reason: slug };
		}
		const op = actor === null ? null : await stateChange(ctx, change, event.collection, id);
		if (op === null) return;
		const text = await refusal(ctx, await principalOf(ctx, actor), op);
		return text === null ? undefined : { cancel: true, reason: text };
	};
}

/** beforeSave, logging each refusal as EmDash reports it to the caller: SAVE_REJECTED. */
export async function loggedBeforeSave(
	event: ContentHookEvent,
	ctx: HookContext,
): Promise<Record<string, unknown> | void> {
	try {
		return await beforeSave(event, ctx);
	} catch (error) {
		if (isContentSaveRejection(error)) {
			log({
				event: "body_access.refused",
				code: "SAVE_REJECTED",
				source: "beforeSave",
				user: actorOf(event.actor)?.id ?? null,
				collection: event.collection,
				reason: error.message,
			});
		}
		throw error;
	}
}

/** policyHook, logging each cancelled publish, unpublish or schedule. */
export function loggedPolicyHook(change: "publish" | "unpublish" | "schedule") {
	const hook = policyHook(change);
	return async (
		event: ContentPolicyEvent,
		ctx: HookContext,
	): Promise<{ cancel: true; reason: string } | void> => {
		const decision = await hook(event, ctx);
		if (decision !== undefined) {
			log({
				event: "body_access.refused",
				code: "BODY_ACCESS_DENIED",
				source: change,
				user: actorOf(event.actor)?.id ?? null,
				collection: event.collection,
				reason: decision.reason,
			});
		}
		return decision;
	};
}

/** ADR-002 O1 backstop: the middleware refuses an upload by a user with no grant first. */
export async function beforeUpload(_event: MediaUploadEvent, ctx: HookContext): Promise<void> {
	const actor = actorOf();
	if (actor === null) return;
	const text = await refusal(ctx, await principalOf(ctx, actor), { kind: "upload" });
	if (text !== null) throw new Error(text);
}
