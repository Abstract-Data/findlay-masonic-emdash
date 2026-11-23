import { allGrants, grantsOf, setGrants } from "@adapters/emdash/grants";
import { isAdminRole, parseBodyId, parseUserId } from "@adapters/emdash/parse";
import type { BodyId, UserId } from "@core/ids";
import { PluginRouteError, type RouteContext } from "emdash";
import { bodyRecords, grantRows } from "./hooks";

export interface BodySummary {
	readonly id: BodyId;
	readonly name: string;
}

async function bodies(ctx: RouteContext): Promise<BodySummary[]> {
	return (await bodyRecords(ctx))
		.toSorted((a, b) => a.order - b.order)
		.map((body) => ({ id: body.id, name: body.displayName }));
}

interface UserSummary {
	readonly id: string;
	readonly name: string | null;
	readonly email: string;
	readonly role: number;
}

async function users(ctx: RouteContext, cursor?: string): Promise<UserSummary[]> {
	const page = await ctx.users?.list({ limit: 100, ...(cursor === undefined ? {} : { cursor }) });
	if (page === undefined) return [];
	const found = page.items.map(({ id, name, email, role }) => ({ id, name, email, role }));
	return page.nextCursor === undefined ? found : [...found, ...(await users(ctx, page.nextCursor))];
}

/** GET grants/list (Admin): every user, every body and every grant, for the Body Access page. */
export async function listGrants(ctx: RouteContext) {
	const [userList, bodyList, grants] = await Promise.all([
		users(ctx),
		bodies(ctx),
		allGrants(grantRows(ctx)),
	]);
	return { users: userList, bodies: bodyList, grants };
}

function parseGrantInput(raw: unknown): { userId: UserId; bodyIds: BodyId[] } | null {
	if (typeof raw !== "object" || raw === null) return null;
	const userId = parseUserId(Reflect.get(raw, "userId"));
	const rawBodies: unknown = Reflect.get(raw, "bodyIds");
	if (userId === null || !Array.isArray(rawBodies)) return null;
	const bodyIds = rawBodies.map((body: unknown) => parseBodyId(body));
	return bodyIds.every((body) => body !== null) ? { userId, bodyIds } : null;
}

/** POST grants/set (Admin), FR-5.1: replaces one user's grants with `bodyIds`. */
export async function saveGrants(ctx: RouteContext) {
	const input = parseGrantInput(ctx.input);
	if (input === null) {
		throw PluginRouteError.badRequest(
			"Send { userId, bodyIds } with body ids from the bodies list.",
		);
	}
	if (!(await ctx.users?.get(input.userId))) {
		throw PluginRouteError.notFound(`No user has the id ${input.userId}.`);
	}
	const known = new Set<string>((await bodies(ctx)).map((body) => body.id));
	const unknown = input.bodyIds.filter((body) => !known.has(body));
	if (unknown.length > 0) {
		throw PluginRouteError.badRequest(`These are not bodies: ${unknown.join(", ")}.`);
	}
	const bodyIds = [...new Set(input.bodyIds)];
	await setGrants(grantRows(ctx), input.userId, bodyIds);
	return { userId: input.userId, bodyIds };
}

/** GET my-bodies: the bodies the caller may assign an entry to (every body for an Admin). */
export async function myBodies(ctx: RouteContext) {
	const caller = ctx.user;
	const callerId = parseUserId(caller?.id);
	if (caller === undefined || callerId === null) throw PluginRouteError.unauthorized();
	const all = await bodies(ctx);
	const granted = isAdminRole(caller.role) ? null : await grantsOf(grantRows(ctx), callerId);
	return {
		bodies: all.map(({ id, name }) => ({ id, name, granted: granted?.has(id) ?? true })),
	};
}
