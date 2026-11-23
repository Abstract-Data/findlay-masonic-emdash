import { authorize, type Decision, type Editor, type Operation } from "@core/acl/policy";
import type { BodyId } from "@core/ids";
import { describe, expect, it } from "vitest";
import { CHAPTER as B, LODGE as A, editor } from "../../fixtures";

const GRANT_SETS: readonly (readonly BodyId[])[] = [[], [A], [B], [A, B]];
const PROFILES = GRANT_SETS.flatMap((grants) =>
	[false, true].map((isAdmin) => ({
		grants,
		isAdmin,
		label: `${isAdmin ? "admin" : "editor"}{${grants.map((g) => (g === A ? "A" : "B")).join(",")}}`,
	})),
);

const OPS: readonly (readonly [string, Operation])[] = [
	["create A", { kind: "create", body: A }],
	["create B", { kind: "create", body: B }],
	["create bodyless", { kind: "create", body: null }],
	["update A->A", { kind: "update", from: A, to: A }],
	["update A->B", { kind: "update", from: A, to: B }],
	["update A->none", { kind: "update", from: A, to: null }],
	["update none->A", { kind: "update", from: null, to: A }],
	["delete A", { kind: "delete", body: A }],
	["publish A", { kind: "publish", body: A }],
	["unpublish A", { kind: "unpublish", body: A }],
	["schedule A", { kind: "schedule", body: A }],
	["upload", { kind: "upload" }],
];

const CASES = PROFILES.flatMap((actorProfile) =>
	[null, ...PROFILES].flatMap((coProfile) =>
		OPS.map(([opLabel, op]) => ({
			name: `${actorProfile.label} with co-editor ${coProfile?.label ?? "none"}: ${opLabel}`,
			actor: editor("actor", actorProfile.grants, actorProfile.isAdmin),
			coEditors: coProfile === null ? [] : [editor("co", coProfile.grants, coProfile.isAdmin)],
			op,
		})),
	),
);

/** The spec's requirement (FR-5.2 to 5.8), written independently of the policy module. */
type Need =
	| { readonly kind: "bodies"; readonly bodies: readonly BodyId[] }
	| { readonly kind: "any-grant" }
	| { readonly kind: "never" };

function need(op: Operation, actor: Editor): Need {
	if (op.kind === "upload") return { kind: "any-grant" };
	if (op.kind === "create") {
		if (op.body !== null) return { kind: "bodies", bodies: [op.body] };
		return actor.grants.size === 1
			? { kind: "bodies", bodies: [...actor.grants] }
			: { kind: "never" };
	}
	if (op.kind === "update") {
		if (op.to === null) return { kind: "never" };
		return { kind: "bodies", bodies: op.from === null ? [op.to] : [op.from, op.to] };
	}
	return { kind: "bodies", bodies: [op.body] };
}

function meets(e: Editor, n: Need): boolean {
	if (e.isAdmin) return true;
	if (n.kind === "any-grant") return e.grants.size > 0;
	return n.kind === "bodies" && n.bodies.every((b) => e.grants.has(b));
}

function invariantFailures(
	actor: Editor,
	coEditors: readonly Editor[],
	op: Operation,
	d: Decision,
) {
	const editors = [actor, ...coEditors];
	const n = need(op, actor);
	const failures: string[] = [];
	if (d.outcome !== "deny" && !editors.every((e) => meets(e, n))) failures.push("I1 soundness");
	if (d.outcome === "deny" && d.reason.code === "no-grant") {
		const { user, body } = d.reason;
		const named = editors.find((e) => e.id === user);
		const required = n.kind === "bodies" && n.bodies.includes(body);
		if (named === undefined || named.isAdmin || named.grants.has(body) || !required) {
			failures.push("I2 named culprit");
		}
	}
	if (d.outcome === "deny" && d.reason.code === "no-body-grants") {
		const { user } = d.reason;
		const named = editors.find((e) => e.id === user);
		if (named === undefined || named.isAdmin || named.grants.size > 0) {
			failures.push("I2 named culprit has no grants");
		}
	}
	if (editors.every((e) => e.isAdmin) && d.outcome === "deny" && d.reason.code !== "missing-body") {
		failures.push("I3 admins only blocked by a missing body");
	}
	const bodylessOneGrant = op.kind === "create" && op.body === null && actor.grants.size === 1;
	if (d.outcome === "assign" && !(bodylessOneGrant && actor.grants.has(d.body))) {
		failures.push("I4 assign only the actor's single grant on a bodyless create");
	}
	if (n.kind !== "never" && editors.every((e) => meets(e, n)) && d.outcome === "deny") {
		failures.push("I5 completeness");
	}
	if (n.kind === "never" && d.outcome !== "deny") {
		failures.push("I6 a change with no assignable body is never allowed");
	}
	return failures;
}

describe("authorize: exhaustive", () => {
	it("enumerates 8 actor profiles x 9 co-editor options x 12 operations", () => {
		expect(PROFILES).toHaveLength(8);
		expect(OPS).toHaveLength(12);
		expect(CASES).toHaveLength(864);
	});

	it.each(CASES)("$name", ({ actor, coEditors, op }) => {
		const decision = authorize({ kind: "user", actor, editedBy: coEditors }, op);
		expect(invariantFailures(actor, coEditors, op, decision)).toEqual([]);
	});

	it.each(OPS)("an internal principal is allowed: %s", (_label, op) => {
		expect(authorize({ kind: "internal", origin: "system" }, op)).toEqual({ outcome: "allow" });
	});
});
