import type { BodyId, UserId } from "../ids";
import type { RuleViolation } from "./content-rules";

/** `isAdmin` is computed at the boundary (EmDash role >= 50). */
export interface Editor {
	readonly id: UserId;
	readonly isAdmin: boolean;
	readonly grants: ReadonlySet<BodyId>;
}

export type Principal =
	| { readonly kind: "user"; readonly actor: Editor; readonly editedBy: readonly Editor[] }
	| { readonly kind: "internal"; readonly origin: "system" | "scheduler" | "plugin" };

export type StateChange = "delete" | "publish" | "unpublish" | "schedule";

/** A body change is an update whose `from` differs from `to`. */
export type Operation =
	| { readonly kind: "create"; readonly body: BodyId | null }
	| { readonly kind: "update"; readonly from: BodyId | null; readonly to: BodyId | null }
	| { readonly kind: StateChange; readonly body: BodyId }
	| { readonly kind: "upload" };

export type DenyReason =
	| { readonly code: "no-grant"; readonly user: UserId; readonly body: BodyId }
	| { readonly code: "no-body-grants"; readonly user: UserId }
	| { readonly code: "missing-body" };

export type Decision =
	| { readonly outcome: "allow" }
	| { readonly outcome: "assign"; readonly body: BodyId }
	| { readonly outcome: "deny"; readonly reason: DenyReason };

/** What every non-admin editor of the change must hold. */
type Requirement =
	| { readonly kind: "bodies"; readonly bodies: readonly BodyId[] }
	| { readonly kind: "assign"; readonly body: BodyId }
	| { readonly kind: "any-grant" }
	| { readonly kind: "deny"; readonly reason: DenyReason };

const ALLOW: Decision = { outcome: "allow" };
const MISSING_BODY: Requirement = { kind: "deny", reason: { code: "missing-body" } };

export function authorize(principal: Principal, op: Operation): Decision {
	if (principal.kind === "internal") return ALLOW;
	const { actor, editedBy } = principal;
	const req = requirement(op, actor);
	if (req.kind === "deny") return { outcome: "deny", reason: req.reason };
	const editors = [actor, ...editedBy.filter((editor) => editor.id !== actor.id)];
	for (const editor of editors) {
		const reason = editor.isAdmin ? null : unmet(editor, req);
		if (reason !== null) return { outcome: "deny", reason };
	}
	return req.kind === "assign" ? { outcome: "assign", body: req.body } : ALLOW;
}

function requirement(op: Operation, actor: Editor): Requirement {
	if (op.kind === "upload") return { kind: "any-grant" };
	if (op.kind === "create") {
		return op.body === null ? bodylessCreate(actor) : { kind: "bodies", bodies: [op.body] };
	}
	if (op.kind === "update") {
		if (op.to === null) return MISSING_BODY;
		return {
			kind: "bodies",
			bodies: op.from === null || op.from === op.to ? [op.to] : [op.from, op.to],
		};
	}
	// Narrowed to the state changes: trash, publish, unpublish, schedule.
	return { kind: "bodies", bodies: [op.body] };
}

// FR-5.5 auto-assign depends on grants only, so an Admin with one grant is assigned too.
function bodylessCreate(actor: Editor): Requirement {
	const [only, ...others] = actor.grants;
	if (only !== undefined && others.length === 0) return { kind: "assign", body: only };
	return only === undefined && !actor.isAdmin
		? { kind: "deny", reason: { code: "no-body-grants", user: actor.id } }
		: MISSING_BODY;
}

function unmet(editor: Editor, req: Exclude<Requirement, { kind: "deny" }>): DenyReason | null {
	if (req.kind === "any-grant") {
		return editor.grants.size > 0 ? null : { code: "no-body-grants", user: editor.id };
	}
	const needed = req.kind === "assign" ? [req.body] : req.bodies;
	const missing = needed.find((body) => !editor.grants.has(body));
	return missing === undefined ? null : { code: "no-grant", user: editor.id, body: missing };
}

const MAX_TEXT = 500;

/** Plain text for a rejection: 1 to 500 characters, never `<` or `>`. */
export function denialText(
	reason: DenyReason | RuleViolation,
	bodyName: ReadonlyMap<BodyId, string>,
): string {
	const name = (body: BodyId) => bodyName.get(body) ?? `body ${body}`;
	const text = message(reason, name).replaceAll(/[<>]/g, "").replaceAll(/\s+/g, " ").trim();
	return text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`;
}

function message(reason: DenyReason | RuleViolation, name: (body: BodyId) => string): string {
	switch (reason.code) {
		case "no-grant":
			return `User ${reason.user} has no grant for ${name(reason.body)}. Ask a Temple administrator for access.`;
		case "no-body-grants":
			return `User ${reason.user} has no body grants. Ask a Temple administrator to grant access to a body.`;
		case "missing-body":
			return "Choose the body this entry belongs to. Every entry must belong to a body.";
		case "unknown-tags":
			return `These tags are not in the ${name(reason.body)} tag list: ${reason.tags.join(", ")}. Add them to the body's tag vocabulary first.`;
	}
	return `"${reason.title}" is not on the officer title list for ${reason.bodyType}.`;
}
