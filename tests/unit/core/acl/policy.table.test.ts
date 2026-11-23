import { authorize, type Editor, type Principal } from "@core/acl/policy";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, editor } from "../../fixtures";

const user = (actor: Editor, ...editedBy: Editor[]): Principal => ({
	kind: "user",
	actor,
	editedBy,
});

const lodgeEditor = editor("lodge-editor", [LODGE]);
const chapterEditor = editor("chapter-editor", [CHAPTER]);
const twoBodyEditor = editor("two-body-editor", [LODGE, CHAPTER]);
const unassigned = editor("unassigned");
const admin = editor("admin", [], true);
const lodgeAdmin = editor("lodge-admin", [LODGE], true);

describe("authorize: decision table", () => {
	it("row 0: an internal write with no actor is allowed (D2)", () => {
		for (const origin of ["system", "scheduler", "plugin"] as const) {
			expect(authorize({ kind: "internal", origin }, { kind: "create", body: null })).toEqual({
				outcome: "allow",
			});
		}
	});

	it("row 1 (FR-5.2): creating for a granted body is allowed", () => {
		expect(authorize(user(lodgeEditor), { kind: "create", body: LODGE })).toEqual({
			outcome: "allow",
		});
	});

	it("row 1 (FR-5.7): an Admin creates for any body without a grant", () => {
		expect(authorize(user(admin), { kind: "create", body: CHAPTER })).toEqual({ outcome: "allow" });
	});

	it("row 2 (FR-5.2, 5.6): creating for an ungranted body is denied, naming user and body", () => {
		expect(authorize(user(lodgeEditor), { kind: "create", body: CHAPTER })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: lodgeEditor.id, body: CHAPTER },
		});
		expect(authorize(user(unassigned), { kind: "create", body: LODGE })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: unassigned.id, body: LODGE },
		});
	});

	it("row 2 (FR-5.3): a co-editor without the body's grant denies the create", () => {
		expect(authorize(user(lodgeEditor, chapterEditor), { kind: "create", body: LODGE })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
		});
	});

	it("row 3 (FR-5.5): a single-grant editor's bodyless create is assigned their body", () => {
		expect(authorize(user(lodgeEditor), { kind: "create", body: null })).toEqual({
			outcome: "assign",
			body: LODGE,
		});
	});

	it("row 3 (FR-5.5): auto-assign depends on grants only, so a one-grant Admin is assigned too", () => {
		expect(authorize(user(lodgeAdmin), { kind: "create", body: null })).toEqual({
			outcome: "assign",
			body: LODGE,
		});
	});

	it("row 4 (FR-5.3): the assigned body is checked against every co-editor", () => {
		expect(authorize(user(lodgeEditor, chapterEditor), { kind: "create", body: null })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
		});
	});

	it("row 5 (FR-5.6): a non-admin with no grants cannot create bodyless content", () => {
		expect(authorize(user(unassigned), { kind: "create", body: null })).toEqual({
			outcome: "deny",
			reason: { code: "no-body-grants", user: unassigned.id },
		});
	});

	it("row 6 (FR-5.8): a bodyless create that cannot be auto-assigned is missing its body", () => {
		const missing = { outcome: "deny", reason: { code: "missing-body" } };
		expect(authorize(user(admin), { kind: "create", body: null })).toEqual(missing);
		expect(authorize(user(twoBodyEditor), { kind: "create", body: null })).toEqual(missing);
	});

	it("row 7 (FR-5.2): updating within one body needs that body's grant", () => {
		expect(authorize(user(lodgeEditor), { kind: "update", from: [LODGE], to: LODGE })).toEqual({
			outcome: "allow",
		});
		expect(authorize(user(lodgeEditor), { kind: "update", from: [], to: LODGE })).toEqual({
			outcome: "allow",
		});
		expect(authorize(user(chapterEditor), { kind: "update", from: [LODGE], to: LODGE })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
		});
	});

	it("row 8 (FR-5.2): moving an entry between bodies needs both grants", () => {
		expect(authorize(user(twoBodyEditor), { kind: "update", from: [LODGE], to: CHAPTER })).toEqual({
			outcome: "allow",
		});
		expect(authorize(user(lodgeEditor), { kind: "update", from: [LODGE], to: CHAPTER })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: lodgeEditor.id, body: CHAPTER },
		});
		expect(authorize(user(chapterEditor), { kind: "update", from: [LODGE], to: CHAPTER })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
		});
	});

	it("row 9 (FR-5.8): clearing an entry's body is denied for everyone, Admins included", () => {
		for (const actor of [admin, twoBodyEditor, lodgeEditor]) {
			expect(authorize(user(actor), { kind: "update", from: [LODGE], to: null })).toEqual({
				outcome: "deny",
				reason: { code: "missing-body" },
			});
		}
	});

	it("row 10 (FR-5.4): every state change needs the entry's body grant", () => {
		const kinds = [
			"delete",
			"restore",
			"publish",
			"unpublish",
			"schedule",
			"unschedule",
			"discard",
		] as const;
		for (const kind of kinds) {
			expect(authorize(user(lodgeEditor), { kind, bodies: [LODGE] })).toEqual({ outcome: "allow" });
			expect(authorize(user(admin), { kind, bodies: [LODGE] })).toEqual({ outcome: "allow" });
			expect(authorize(user(chapterEditor), { kind, bodies: [LODGE] })).toEqual({
				outcome: "deny",
				reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
			});
		}
	});

	it("row 12 (FR-5.4): a draft that moves the entry needs the live and the draft body", () => {
		expect(authorize(user(lodgeEditor), { kind: "publish", bodies: [CHAPTER, LODGE] })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: lodgeEditor.id, body: CHAPTER },
		});
		expect(authorize(user(twoBodyEditor), { kind: "publish", bodies: [CHAPTER, LODGE] })).toEqual({
			outcome: "allow",
		});
		expect(
			authorize(user(lodgeEditor), { kind: "update", from: [LODGE, CHAPTER], to: CHAPTER }),
		).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: lodgeEditor.id, body: CHAPTER },
		});
	});

	it("row 13 (FR-5.8): a state change on an entry with no body is for Admins only", () => {
		expect(authorize(user(admin), { kind: "delete", bodies: [] })).toEqual({ outcome: "allow" });
		expect(authorize(user(twoBodyEditor), { kind: "delete", bodies: [] })).toEqual({
			outcome: "deny",
			reason: { code: "missing-body" },
		});
	});

	it("row 14 (ADR-002 O1): only the uploader or an Admin changes a media item", () => {
		expect(authorize(user(lodgeEditor), { kind: "media", uploader: lodgeEditor.id })).toEqual({
			outcome: "allow",
		});
		expect(authorize(user(admin), { kind: "media", uploader: lodgeEditor.id })).toEqual({
			outcome: "allow",
		});
		for (const uploader of [chapterEditor.id, null]) {
			expect(authorize(user(lodgeEditor), { kind: "media", uploader })).toEqual({
				outcome: "deny",
				reason: { code: "not-uploader", user: lodgeEditor.id },
			});
		}
	});

	it("row 15 (ADR-002): admin-only actions deny every non-admin, naming the action", () => {
		for (const action of ["use-mcp", "add-body", "unlisted"] as const) {
			expect(authorize(user(admin), { kind: "admin-only", action })).toEqual({ outcome: "allow" });
			expect(authorize(user(twoBodyEditor), { kind: "admin-only", action })).toEqual({
				outcome: "deny",
				reason: { code: "admin-only", user: twoBodyEditor.id, action },
			});
		}
	});

	it("row 11 (ADR-001): uploads need an Admin or at least one body grant", () => {
		expect(authorize(user(lodgeEditor), { kind: "upload" })).toEqual({ outcome: "allow" });
		expect(authorize(user(admin), { kind: "upload" })).toEqual({ outcome: "allow" });
		expect(authorize(user(unassigned), { kind: "upload" })).toEqual({
			outcome: "deny",
			reason: { code: "no-body-grants", user: unassigned.id },
		});
		expect(authorize(user(lodgeEditor, unassigned), { kind: "upload" })).toEqual({
			outcome: "deny",
			reason: { code: "no-body-grants", user: unassigned.id },
		});
	});
});

describe("authorize: editor set", () => {
	it("D1: an Admin actor does not launder an ungranted co-editor", () => {
		expect(authorize(user(admin, chapterEditor), { kind: "publish", bodies: [LODGE] })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
		});
	});

	it("an Admin co-editor never blocks a granted actor", () => {
		expect(authorize(user(lodgeEditor, admin), { kind: "publish", bodies: [LODGE] })).toEqual({
			outcome: "allow",
		});
	});

	it("checks the actor before co-editors", () => {
		expect(
			authorize(user(chapterEditor, unassigned), { kind: "publish", bodies: [LODGE] }),
		).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
		});
	});

	it("checks co-editors in editedBy order", () => {
		expect(
			authorize(user(lodgeEditor, chapterEditor, unassigned), { kind: "publish", bodies: [LODGE] }),
		).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: chapterEditor.id, body: LODGE },
		});
	});

	it("checks the source body before the destination of a move", () => {
		expect(authorize(user(unassigned), { kind: "update", from: [CHAPTER], to: LODGE })).toEqual({
			outcome: "deny",
			reason: { code: "no-grant", user: unassigned.id, body: CHAPTER },
		});
	});

	it("counts an actor listed in editedBy once, by id", () => {
		const sameUserNoGrants = editor(lodgeEditor.id);
		expect(
			authorize(user(lodgeEditor, sameUserNoGrants), { kind: "publish", bodies: [LODGE] }),
		).toEqual({ outcome: "allow" });
	});
});
