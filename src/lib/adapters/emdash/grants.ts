import type { Editor, Principal } from "@core/acl/policy";
import type { BodyId, UserId } from "@core/ids";
import { isAdminRole, parseBodyId, parseUserId } from "./parse";

/** Plugin storage coordinates, shared by the plugin (ctx.storage) and the middleware. */
export const GRANTS = {
	pluginId: "body-access",
	collection: "grants",
	indexes: ["userId", "bodyId"],
};

/** One grant row: `userId` may write `bodyId`'s content. The row id is `${userId}:${bodyId}`. */
export interface Grant {
	readonly userId: string;
	readonly bodyId: string;
}

/** The slice of EmDash plugin storage grants use; ctx.storage.grants and PluginStorageRepository fit. */
export interface GrantRows {
	query(options: {
		where?: { userId?: string };
		limit?: number;
		cursor?: string;
	}): Promise<{ items: { id: string; data: unknown }[]; cursor?: string; hasMore: boolean }>;
	putMany(items: { id: string; data: Grant }[]): Promise<void>;
	deleteMany(ids: string[]): Promise<number>;
}

const PAGE = 100;

async function rows(
	store: GrantRows,
	userId?: string,
	cursor?: string,
): Promise<{ id: string; grant: Grant }[]> {
	const page = await store.query({
		...(userId === undefined ? {} : { where: { userId } }),
		limit: PAGE,
		...(cursor === undefined ? {} : { cursor }),
	});
	const found = page.items.flatMap((item) => {
		const grant = parseGrant(item.data);
		return grant === null ? [] : [{ id: item.id, grant }];
	});
	return page.hasMore && page.cursor !== undefined
		? [...found, ...(await rows(store, userId, page.cursor))]
		: found;
}

function parseGrant(raw: unknown): Grant | null {
	if (typeof raw !== "object" || raw === null) return null;
	const userId: unknown = Reflect.get(raw, "userId");
	const bodyId: unknown = Reflect.get(raw, "bodyId");
	return typeof userId === "string" && typeof bodyId === "string" ? { userId, bodyId } : null;
}

/** A row that names no valid body grants nothing, so it is skipped rather than trusted. */
export async function grantsOf(store: GrantRows, user: UserId): Promise<Set<BodyId>> {
	const bodies = (await rows(store, user)).map(({ grant }) => parseBodyId(grant.bodyId));
	return new Set(bodies.filter((body) => body !== null));
}

export async function allGrants(store: GrantRows): Promise<Grant[]> {
	return (await rows(store)).map(({ grant }) => grant);
}

/** FR-5.1: replaces the user's grants with exactly `bodies`. Running it twice changes nothing. */
export async function setGrants(
	store: GrantRows,
	user: UserId,
	bodies: readonly BodyId[],
): Promise<void> {
	const wanted = new Set<string>(bodies);
	const current = await rows(store, user);
	const stale = current.filter(({ grant }) => !wanted.has(grant.bodyId)).map(({ id }) => id);
	const held = new Set(current.map(({ grant }) => grant.bodyId));
	const added = [...wanted].filter((body) => !held.has(body));
	if (stale.length > 0) await store.deleteMany(stale);
	if (added.length > 0) {
		await store.putMany(
			added.map((bodyId) => ({ id: `${user}:${bodyId}`, data: { userId: user, bodyId } })),
		);
	}
}

export interface Directory {
	grantsOf(user: UserId): Promise<ReadonlySet<BodyId>>;
	/** The user's current role, or null when the account no longer exists. */
	roleOf(user: UserId): Promise<number | null>;
}

/**
 * FR-5.3: the actor and every co-editor, each built once from one role and one grants lookup,
 * so an editedBy entry naming the actor is never a second, stale record. The actor's role is
 * the one its session resolved; a co-editor whose account is gone counts as a non-admin.
 * Null when the actor id is not a user id.
 */
export async function principalFor(
	actor: { readonly id: string; readonly role: number },
	editedBy: readonly string[],
	directory: Directory,
): Promise<Principal | null> {
	const actorId = parseUserId(actor.id);
	if (actorId === null) return null;
	const editor = async (id: UserId, role: number | null): Promise<Editor> => ({
		id,
		isAdmin: role !== null && isAdminRole(role),
		grants: await directory.grantsOf(id),
	});
	const coIds = [...new Set(editedBy.flatMap((raw) => parseUserId(raw) ?? []))].filter(
		(id) => id !== actorId,
	);
	const self = await editor(actorId, actor.role);
	const coEditors = await Promise.all(
		coIds.map(async (id) => editor(id, await directory.roleOf(id))),
	);
	return { kind: "user", actor: self, editedBy: coEditors };
}
