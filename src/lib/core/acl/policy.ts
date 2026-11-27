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

/** Changes to an existing entry that leave its body as it is. */
export type StateChange =
	| "delete"
	| "restore"
	| "publish"
	| "unpublish"
	| "schedule"
	| "unschedule"
	| "discard";

/** What only an Admin may do, named in the denial text. */
export type AdminAction = "use-mcp" | "add-body" | "retire-body" | "unlisted";

/** State changes that take a body's own page offline, which only an Admin makes. */
const RETIRES_A_BODY: ReadonlySet<StateChange> = new Set(["delete", "unpublish", "schedule"]);

/**
 * `from` and `bodies` are an existing entry's stored bodies: its live body, then its draft's
 * body when an unpublished draft moves it. Empty means the entry has no body. A body change
 * is an update whose `to` is not among `from`. A `body-page` change is a state change to a
 * body's own page, which belongs to that body.
 */
export type Operation =
	| { readonly kind: "create"; readonly body: BodyId | null }
	| { readonly kind: "update"; readonly from: readonly BodyId[]; readonly to: BodyId | null }
	| { readonly kind: StateChange; readonly bodies: readonly BodyId[] }
	| { readonly kind: "body-page"; readonly change: StateChange; readonly body: BodyId | null }
	| { readonly kind: "upload" }
	| { readonly kind: "media"; readonly uploader: UserId | null }
	| { readonly kind: "admin-only"; readonly action: AdminAction };

export type DenyReason =
	| { readonly code: "no-grant"; readonly user: UserId; readonly body: BodyId }
	| { readonly code: "no-body-grants"; readonly user: UserId }
	| { readonly code: "missing-body" }
	| { readonly code: "not-uploader"; readonly user: UserId }
	| { readonly code: "admin-only"; readonly user: UserId; readonly action: AdminAction };

export type Decision =
	| { readonly outcome: "allow" }
	| { readonly outcome: "assign"; readonly body: BodyId }
	| { readonly outcome: "deny"; readonly reason: DenyReason };

/** What every non-admin editor of the change must hold. */
type Requirement =
	| { readonly kind: "bodies"; readonly bodies: readonly BodyId[] }
	| { readonly kind: "assign"; readonly body: BodyId }
	| { readonly kind: "any-grant" }
	| { readonly kind: "uploader"; readonly user: UserId | null }
	| { readonly kind: "admins"; readonly denial: AdminAction | "missing-body" }
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
	switch (op.kind) {
		case "upload":
			return { kind: "any-grant" };
		case "media":
			return { kind: "uploader", user: op.uploader };
		case "admin-only":
			return { kind: "admins", denial: op.action };
		case "body-page":
			if (RETIRES_A_BODY.has(op.change)) return { kind: "admins", denial: "retire-body" };
			return op.body === null
				? { kind: "admins", denial: "missing-body" }
				: { kind: "bodies", bodies: [op.body] };
		case "create":
			return op.body === null ? bodylessCreate(actor) : { kind: "bodies", bodies: [op.body] };
		case "update":
			return op.to === null
				? MISSING_BODY
				: { kind: "bodies", bodies: [...new Set([...op.from, op.to])] };
		default:
			// An entry outside the access model stays reachable for Admins to repair or remove.
			return op.bodies.length === 0
				? { kind: "admins", denial: "missing-body" }
				: { kind: "bodies", bodies: op.bodies };
	}
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
	switch (req.kind) {
		case "any-grant":
			return editor.grants.size > 0 ? null : { code: "no-body-grants", user: editor.id };
		case "uploader":
			return editor.id === req.user ? null : { code: "not-uploader", user: editor.id };
		case "admins":
			return req.denial === "missing-body"
				? { code: "missing-body" }
				: { code: "admin-only", user: editor.id, action: req.denial };
		default: {
			const needed = req.kind === "assign" ? [req.body] : req.bodies;
			const missing = needed.find((body) => !editor.grants.has(body));
			return missing === undefined ? null : { code: "no-grant", user: editor.id, body: missing };
		}
	}
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

const ADMIN_ACTIONS: Record<AdminAction, string> = {
	"use-mcp": "use the MCP endpoint",
	"add-body": "add a body",
	"retire-body": "trash, unpublish or schedule a body's page",
	unlisted: "make this change",
};

function message(reason: DenyReason | RuleViolation, name: (body: BodyId) => string): string {
	switch (reason.code) {
		case "no-grant":
			return `User ${reason.user} has no grant for ${name(reason.body)}. Ask a Temple administrator for access.`;
		case "no-body-grants":
			return `User ${reason.user} has no body grants. Ask a Temple administrator to grant access to a body.`;
		case "missing-body":
			return "Choose the body this entry belongs to. Every entry must belong to a body.";
		case "not-uploader":
			return `User ${reason.user} did not upload this file. Only its uploader or a Temple administrator can change or delete it. If you uploaded an identical file, the library kept the copy of whoever first uploaded it. You can still use it in your content.`;
		case "admin-only":
			return `User ${reason.user} cannot ${ADMIN_ACTIONS[reason.action]}. Only a Temple administrator can.`;
		case "unknown-tags":
			return `These tags are not in the ${name(reason.body)} tag list: ${reason.tags.join(", ")}. Add them to the body's tag vocabulary first.`;
		case "translation-in-another-body":
			return `A translation belongs to the body of the entry it translates. Choose ${name(reason.body)} as its body.`;
	}
	return `"${reason.title}" is not on the officer title list for ${reason.bodyType}.`;
}
