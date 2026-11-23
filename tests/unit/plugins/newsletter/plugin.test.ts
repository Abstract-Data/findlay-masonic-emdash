import { createPlugin } from "@plugins/newsletter";
import { ADMIN_PERMISSION } from "@plugins/newsletter/routes";
import { HookPipeline } from "emdash";
import { describe, expect, it } from "vitest";

// Why the plugin holds each capability; EmDash silently skips a hook whose capability is missing.
const CAPABILITIES: Readonly<Record<string, string>> = {
	"content:read": "issue assembly lists bodies, news and events",
	"hooks.email-transport:register": "email:deliver registers only with it (FR-8.1)",
};

describe("newsletter plugin structure", () => {
	it("declares exactly the capabilities its hook and routes need", () => {
		expect(new Set(createPlugin().capabilities)).toEqual(new Set(Object.keys(CAPABILITIES)));
	});

	it("gets its email:deliver transport registered by EmDash, not skipped", () => {
		const registered = new HookPipeline([createPlugin()]).getRegisteredHooks();
		expect(registered).toContain("email:deliver");
	});

	it("gates every issue route to Admins (spec Q5)", () => {
		const { routes } = createPlugin();
		const issueRoutes = Object.entries(routes).filter(([name]) => name.startsWith("issues/"));
		expect(issueRoutes.map(([name]) => name).toSorted()).toEqual([
			"issues/approve",
			"issues/discard",
			"issues/get",
			"issues/list",
			"issues/new",
			"issues/save",
			"issues/test-send",
		]);
		for (const [, route] of issueRoutes) {
			expect(route).toMatchObject({ permission: ADMIN_PERMISSION });
			expect(route.public).not.toBe(true);
		}
		expect(ADMIN_PERMISSION).toBe("settings:manage");
	});

	it("makes public only the signup form post and the archive's read-only GETs", () => {
		const { routes } = createPlugin();
		const open = Object.entries(routes).filter(([, route]) => route.public === true);
		expect(open.map(([name]) => name).toSorted()).toEqual([
			"archive/issue",
			"archive/list",
			"subscribe",
		]);
		expect(routes["archive/list"]).toMatchObject({ methods: ["GET"] });
		expect(routes["archive/issue"]).toMatchObject({ methods: ["GET"] });
		expect(routes.subscribe).toMatchObject({
			methods: ["POST"],
			request: { body: "form-data" },
			response: "raw",
		});
	});

	it("adds the fake's outbox and unsubscribe routes only on the dev server, for Admins", () => {
		expect(import.meta.env.DEV).toBe(true);
		expect(createPlugin().routes["dev/outbox"]).toMatchObject({ permission: ADMIN_PERMISSION });
		expect(createPlugin().routes["dev/unsubscribe"]).toMatchObject({
			permission: ADMIN_PERMISSION,
		});
	});
});
