import type { Operation, StateChange } from "@core/acl/policy";
import type { BodyId } from "@core/ids";
import { parseBodyId } from "./parse";

/**
 * How a collection's entries belong to bodies. A `body-field` entry names its body in `body`;
 * a `bodies` entry is its own body; a `site` collection is site-wide, like menus (an accepted
 * residual risk, constitution § Per-body access control).
 */
export type Scope = "body-field" | "self" | "site";

// A Map, because the collection comes from the request and must never match an Object key.
export const COLLECTION_SCOPES: ReadonlyMap<string, Scope> = new Map([
	["officers", "body-field"],
	["events", "body-field"],
	["news", "body-field"],
	["bodies", "self"],
	["pages", "site"],
]);

/** A collection missing from the table is Admin-only, so a new collection fails closed. */
export function scopeOf(collection: string): Scope | "unlisted" {
	return COLLECTION_SCOPES.get(collection) ?? "unlisted";
}

/**
 * An entry as EmDash hands it to routes and policy hooks: `data` holds the draft's values over
 * the live ones, and `liveData` holds the live values when a draft exists.
 */
export interface StoredEntry {
	readonly id: unknown;
	readonly data?: unknown;
	readonly liveData?: unknown;
}

/** An entry as EmDash stores it: its live values, and its pending draft's revision id. */
export interface EntryRow {
	readonly id: string;
	readonly data: Record<string, unknown>;
	readonly draftRevisionId?: string | null;
}

export type ReadEntry = StoredEntry & {
	readonly data: Record<string, unknown>;
	/** The slug the pending draft stages (`_slug`), which goes live when it is published. */
	readonly stagedSlug?: string;
};

/** Where EmDash stages a draft's new slug in the revision's data (content-save.ts). */
const STAGED_SLUG = "_slug";

/**
 * What an editor or an Admin sees when an entry names a draft revision that no longer exists.
 * Saving again cannot help; discarding the draft gives the entry back its live values.
 */
export const MISSING_DRAFT_TEXT =
	"The entry's pending draft is missing, so the change was refused. Choose Discard changes on the entry to drop the broken draft, then make the change again.";

/**
 * The entry as EmDash's routes read it, with its draft's values over the live ones. Null when
 * the entry has a pending draft that could not be read: the caller refuses, because checking
 * the live body alone would miss a draft that moves the entry.
 */
export function overlayDraft(
	row: EntryRow,
	draft: { readonly data: Record<string, unknown> } | null,
): ReadEntry | null {
	if (!row.draftRevisionId) return { id: row.id, data: row.data };
	if (draft === null) return null;
	const staged = Object.entries(draft.data).filter(([key]) => !key.startsWith("_"));
	const slug = draft.data[STAGED_SLUG];
	return {
		id: row.id,
		data: { ...row.data, ...Object.fromEntries(staged) },
		liveData: row.data,
		...(typeof slug === "string" ? { stagedSlug: slug } : {}),
	};
}

export type OwnedScope = Exclude<Scope, "site">;

function field(record: unknown, key: string): unknown {
	return typeof record === "object" && record !== null ? Reflect.get(record, key) : undefined;
}

function liveBody(entry: StoredEntry): BodyId | null {
	return parseBodyId(field(entry.liveData ?? entry.data, "body"));
}

/** Where a save that leaves `body` alone keeps the entry: its draft's body, else its live one. */
export function targetBody(scope: OwnedScope, entry: StoredEntry): BodyId | null {
	return scope === "self" ? parseBodyId(entry.id) : parseBodyId(field(entry.data, "body"));
}

/** The live body, then the draft's body when an unpublished draft moves the entry. */
export function storedBodies(scope: OwnedScope, entry: StoredEntry): BodyId[] {
	const bodies = [scope === "self" ? null : liveBody(entry), targetBody(scope, entry)];
	return [...new Set(bodies.filter((body) => body !== null))];
}

/**
 * FR-5.2 to 5.8: the operation a content save performs. `existing` is null on a create, and
 * `saved` is the entry's values once the save applies. Null means the save is not guarded.
 */
export function saveOperation(
	scope: Scope | "unlisted",
	existing: StoredEntry | null,
	saved: Readonly<Record<string, unknown>>,
): Operation | null {
	switch (scope) {
		case "site":
			return null;
		case "unlisted":
			return { kind: "admin-only", action: "unlisted" };
		case "self":
			return existing === null
				? { kind: "admin-only", action: "add-body" }
				: { kind: "update", from: storedBodies(scope, existing), to: targetBody(scope, existing) };
	}
	const to = parseBodyId(saved.body);
	return existing === null
		? { kind: "create", body: to }
		: { kind: "update", from: storedBodies(scope, existing), to };
}

/** FR-5.4: a state change to an entry, or to a body's own page, which core rules on apart. */
export function stateChangeOperation(
	change: StateChange,
	scope: OwnedScope,
	entry: StoredEntry,
): Operation {
	return scope === "self"
		? { kind: "body-page", change, body: targetBody(scope, entry) }
		: { kind: change, bodies: storedBodies(scope, entry) };
}

/** Entry routes the middleware guards. */
export type EntryAction =
	| "update"
	| "delete"
	| "restore"
	| "duplicate"
	| "discard"
	| "unschedule"
	| "unpublish";

/** An `update` here keeps the stored body: the body field itself is checked by the save hook. */
export function entryOperation(
	action: EntryAction,
	scope: OwnedScope,
	entry: StoredEntry,
): Operation {
	switch (action) {
		case "update":
			return { kind: "update", from: storedBodies(scope, entry), to: targetBody(scope, entry) };
		case "duplicate":
			// A duplicate copies the live values into a new entry.
			return scope === "self"
				? { kind: "admin-only", action: "add-body" }
				: { kind: "create", body: liveBody(entry) };
		default:
			return stateChangeOperation(action, scope, entry);
	}
}

/** Restoring a revision moves the entry to the body that revision stored. */
export function revisionRestoreOperation(
	scope: OwnedScope,
	current: StoredEntry,
	revisionData: unknown,
): Operation {
	return {
		kind: "update",
		from: storedBodies(scope, current),
		to: scope === "self" ? targetBody(scope, current) : parseBodyId(field(revisionData, "body")),
	};
}
