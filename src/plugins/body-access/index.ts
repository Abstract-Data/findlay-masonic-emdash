import { definePlugin } from "emdash";
import { GRANTS } from "@adapters/emdash/grants";
import { beforeDelete, beforeSave, beforeUpload, policyHook } from "./hooks";
import { listGrants, myBodies, saveGrants } from "./routes";

/**
 * Native EmDash plugin for per-body write isolation (constitution § Per-body access control).
 * The policy is core's `authorize`; these hooks and src/middleware.ts are its two callers.
 * EmDash silently skips a hook whose capability is missing, which
 * tests/unit/plugins/body-access.test.ts guards.
 */
export function createPlugin() {
	return definePlugin({
		id: GRANTS.pluginId,
		version: "1.0.0",
		capabilities: [
			"content:write",
			"content:revisions:read",
			"hooks.content-policy:register",
			"media:write",
			"users:read",
		],
		storage: { [GRANTS.collection]: { indexes: GRANTS.indexes } },
		hooks: {
			"content:beforeSave": beforeSave,
			"content:beforeDelete": beforeDelete,
			"content:beforePublish": policyHook("publish"),
			"content:beforeUnpublish": policyHook("unpublish"),
			"content:beforeSchedule": policyHook("schedule"),
			"media:beforeUpload": beforeUpload,
		},
		routes: {
			"grants/list": { methods: ["GET"], permission: "users:manage", handler: listGrants },
			"grants/set": { methods: ["POST"], permission: "users:manage", handler: saveGrants },
			"my-bodies": { methods: ["GET"], permission: "content:create", handler: myBodies },
		},
		admin: {
			// A flag only: EmDash loads the module named by the descriptor's adminEntry.
			entry: "body-access/admin",
			pages: [{ path: "/", label: "Body Access", icon: "users" }],
			fieldWidgets: [{ name: "body", label: "Body", fieldTypes: ["reference"] }],
		},
	});
}
