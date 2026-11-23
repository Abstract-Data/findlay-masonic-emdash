import { createPlugin } from "@plugins/body-access";
import { HookPipeline } from "emdash";
import { describe, expect, it } from "vitest";

// Why the plugin holds each capability. EmDash registers a hook only when the plugin holds the
// capability the hook needs, and skips it with nothing but a console warning otherwise.
const CAPABILITIES: Readonly<Record<string, string>> = {
	"content:write": "content:beforeSave registers only with it",
	"content:read": "implied by content:write; content:beforeDelete and ctx.content.get",
	"content:revisions:read": "ctx.content.getRevision reads the body an unpublished draft holds",
	"hooks.content-policy:register": "content:beforePublish, beforeUnpublish and beforeSchedule",
	"media:write": "media:beforeUpload registers only with it",
	"media:read": "implied by media:write",
	"users:read": "ctx.users reads co-editors' roles and lists users on the Body Access page",
};

const GUARD_HOOKS = [
	"content:beforeSave",
	"content:beforeDelete",
	"content:beforePublish",
	"content:beforeUnpublish",
	"content:beforeSchedule",
	"media:beforeUpload",
];

describe("body-access plugin capabilities (ADR-002)", () => {
	it("declares exactly the capabilities its hooks and context calls need", () => {
		expect(new Set(createPlugin().capabilities)).toEqual(new Set(Object.keys(CAPABILITIES)));
	});

	it("gets every guard hook registered by EmDash, none skipped", () => {
		const plugin = createPlugin();
		expect(Object.keys(plugin.hooks).toSorted()).toEqual(GUARD_HOOKS.toSorted());
		const registered = new HookPipeline([plugin]).getRegisteredHooks();
		expect(new Set(registered)).toEqual(new Set(GUARD_HOOKS));
	});

	it("gates grant administration to Admins and the field widget's list to writers", () => {
		const { routes } = createPlugin();
		expect(routes["grants/list"]).toMatchObject({ methods: ["GET"], permission: "users:manage" });
		expect(routes["grants/set"]).toMatchObject({ methods: ["POST"], permission: "users:manage" });
		expect(routes["my-bodies"]).toMatchObject({ methods: ["GET"], permission: "content:create" });
		expect(Object.values(routes).some((route) => route.public === true)).toBe(false);
	});
});
