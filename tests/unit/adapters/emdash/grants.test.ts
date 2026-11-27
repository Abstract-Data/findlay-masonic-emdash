import {
	allGrants,
	grantsOf,
	principalFor,
	setGrants,
	type Directory,
	type Grant,
	type GrantRows,
} from "@adapters/emdash/grants";
import type { BodyId, UserId } from "@core/ids";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, bodyId, userId } from "../../fixtures";

/** Plugin storage in memory, two rows to a page so paging runs. */
function memoryRows(initial: readonly { id: string; data: unknown }[] = []) {
	const rows = new Map(initial.map((row) => [row.id, row.data]));
	const store: GrantRows = {
		async query({ where, cursor }) {
			const matching = [...rows]
				.filter(
					([, data]) =>
						where?.userId === undefined || Reflect.get(Object(data), "userId") === where.userId,
				)
				.map(([id, data]) => ({ id, data }));
			const start = cursor === undefined ? 0 : Number(cursor);
			const items = matching.slice(start, start + 2);
			const more = start + 2 < matching.length;
			return { items, hasMore: more, ...(more ? { cursor: String(start + 2) } : {}) };
		},
		async putMany(items) {
			for (const item of items) rows.set(item.id, item.data);
		},
		async deleteMany(ids) {
			for (const id of ids) rows.delete(id);
			return ids.length;
		},
	};
	return { store, rows };
}

const grant = (user: string, body: BodyId): { id: string; data: Grant } => ({
	id: `${user}:${body}`,
	data: { userId: user, bodyId: body },
});

describe("grants storage (FR-5.1)", () => {
	it("reads a user's grants across pages and skips rows that name no body", async () => {
		const { store } = memoryRows([
			grant("u1", LODGE),
			grant("u2", CHAPTER),
			grant("u1", CHAPTER),
			grant("u1", bodyId(3)),
			{ id: "u1:junk", data: { userId: "u1", bodyId: "not-a-body" } },
			{ id: "broken", data: "x" },
		]);
		expect(await grantsOf(store, userId("u1"))).toEqual(new Set([LODGE, CHAPTER, bodyId(3)]));
		expect(await allGrants(store)).toHaveLength(5);
	});

	it("replaces a user's grants exactly and converges when repeated", async () => {
		const { store, rows } = memoryRows([grant("u1", LODGE), grant("u2", LODGE)]);
		await setGrants(store, userId("u1"), [CHAPTER, CHAPTER]);
		await setGrants(store, userId("u1"), [CHAPTER]);
		expect(await grantsOf(store, userId("u1"))).toEqual(new Set([CHAPTER]));
		expect(await grantsOf(store, userId("u2"))).toEqual(new Set([LODGE]));
		expect([...rows.keys()].toSorted()).toEqual([`u1:${CHAPTER}`, `u2:${LODGE}`]);
		await setGrants(store, userId("u1"), []);
		expect(await grantsOf(store, userId("u1"))).toEqual(new Set());
	});
});

describe("principalFor (FR-5.3)", () => {
	const lookups: string[] = [];
	const directory: Directory = {
		async grantsOf(user: UserId) {
			lookups.push(`grants ${user}`);
			return new Set(user === "lodge" ? [LODGE] : []);
		},
		async roleOf(user: UserId) {
			lookups.push(`role ${user}`);
			return user === "admin" ? 50 : user === "gone" ? null : 40;
		},
	};

	it("builds one record per user, so the actor listed in editedBy is the actor's record", async () => {
		lookups.length = 0;
		const principal = await principalFor(
			{ id: "lodge", role: 40 },
			["lodge", "chapter", "chapter"],
			directory,
		);
		expect(principal).toEqual({
			kind: "user",
			actor: { id: "lodge", isAdmin: false, grants: new Set([LODGE]) },
			editedBy: [{ id: "chapter", isAdmin: false, grants: new Set() }],
		});
		expect(lookups.toSorted()).toEqual(["grants chapter", "grants lodge", "role chapter"]);
	});

	it("takes the actor's role from its session and a co-editor's from the directory", async () => {
		const principal = await principalFor({ id: "lodge", role: 50 }, ["admin", "gone"], directory);
		expect(principal).toMatchObject({
			actor: { id: "lodge", isAdmin: true },
			editedBy: [
				{ id: "admin", isAdmin: true },
				{ id: "gone", isAdmin: false },
			],
		});
	});

	it("names no principal for an actor without a user id", async () => {
		expect(await principalFor({ id: " ", role: 50 }, [], directory)).toBeNull();
	});
});
