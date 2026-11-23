import { authorize, type Decision, type Editor, type Operation } from "@core/acl/policy";
import type { BodyId, UserId } from "@core/ids";
import { describe, expect, it } from "vitest";
import { CHAPTER as B, LODGE as A, editor, userId } from "../../fixtures";

const GRANT_SETS: readonly (readonly BodyId[])[] = [[], [A], [B], [A, B]];
const PROFILES = GRANT_SETS.flatMap((grants) =>
	[false, true].map((isAdmin) => ({
		grants,
		isAdmin,
		label: `${isAdmin ? "admin" : "editor"}{${grants.map((g) => (g === A ? "A" : "B")).join(",")}}`,
	})),
);

const STATE_CHANGES = [
	"delete",
	"restore",
	"publish",
	"unpublish",
	"schedule",
	"unschedule",
	"discard",
] as const;

const OPS: readonly (readonly [string, Operation])[] = [
	["create A", { kind: "create", body: A }],
	["create B", { kind: "create", body: B }],
	["create bodyless", { kind: "create", body: null }],
	["update A->A", { kind: "update", from: [A], to: A }],
	["update A->B", { kind: "update", from: [A], to: B }],
	["update A->none", { kind: "update", from: [A], to: null }],
	["update none->A", { kind: "update", from: [], to: A }],
	["update A with draft B->B", { kind: "update", from: [A, B], to: B }],
	...STATE_CHANGES.map((kind): readonly [string, Operation] => [
		`${kind} A`,
		{ kind, bodies: [A] },
	]),
	["publish A with draft B", { kind: "publish", bodies: [A, B] }],
	["delete bodyless", { kind: "delete", bodies: [] }],
	["upload", { kind: "upload" }],
	["media uploaded by the actor", { kind: "media", uploader: userId("actor") }],
	["media uploaded by someone else", { kind: "media", uploader: userId("someone") }],
	["media with no recorded uploader", { kind: "media", uploader: null }],
	["admin-only", { kind: "admin-only", action: "use-mcp" }],
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

/** The spec's requirement (FR-5.2 to 5.8, ADR-002), written independently of the policy module. */
type Need =
	| { readonly kind: "bodies"; readonly bodies: readonly BodyId[] }
	| { readonly kind: "any-grant" }
	| { readonly kind: "uploader"; readonly user: UserId | null }
	| { readonly kind: "admin" }
	| { readonly kind: "never" };

function need(op: Operation, actor: Editor): Need {
	switch (op.kind) {
		case "upload":
			return { kind: "any-grant" };
		case "media":
			return { kind: "uploader", user: op.uploader };
		case "admin-only":
			return { kind: "admin" };
		case "create":
			if (op.body !== null) return { kind: "bodies", bodies: [op.body] };
			return actor.grants.size === 1
				? { kind: "bodies", bodies: [...actor.grants] }
				: { kind: "never" };
		case "update":
			return op.to === null ? { kind: "never" } : { kind: "bodies", bodies: [...op.from, op.to] };
		default:
			return op.bodies.length === 0 ? { kind: "admin" } : { kind: "bodies", bodies: op.bodies };
	}
}

function meets(e: Editor, n: Need): boolean {
	if (e.isAdmin) return true;
	if (n.kind === "any-grant") return e.grants.size > 0;
	if (n.kind === "uploader") return e.id === n.user;
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
	if (
		d.outcome === "deny" &&
		(d.reason.code === "not-uploader" || d.reason.code === "admin-only")
	) {
		const { user } = d.reason;
		const named = editors.find((e) => e.id === user);
		if (named === undefined || meets(named, n)) failures.push("I2 named culprit fails the need");
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
	it("enumerates 8 actor profiles x 9 co-editor options x 22 operations", () => {
		expect(PROFILES).toHaveLength(8);
		expect(OPS).toHaveLength(22);
		expect(CASES).toHaveLength(1584);
	});

	it.each(CASES)("$name", ({ actor, coEditors, op }) => {
		const decision = authorize({ kind: "user", actor, editedBy: coEditors }, op);
		expect(invariantFailures(actor, coEditors, op, decision)).toEqual([]);
	});

	it.each(OPS)("an internal principal is allowed: %s", (_label, op) => {
		expect(authorize({ kind: "internal", origin: "system" }, op)).toEqual({ outcome: "allow" });
	});
});
