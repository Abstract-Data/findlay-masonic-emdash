import { offAllowlist, parseSiteEnv } from "@adapters/send-gate";
import { realRuntime, type Settings } from "@plugins/newsletter/runtime";
import { transport } from "@plugins/newsletter/transport";
import type { EmailDeliverEvent } from "emdash";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Every request the Resend SDK makes, answered as a successful send. */
function resendApi(): string[] {
	const sent: string[] = [];
	vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
		const body: unknown = typeof init.body === "string" ? JSON.parse(init.body) : null;
		sent.push(...[Reflect.get(Object(body), "to") ?? []].flat().map(String));
		return Response.json({ id: "email-1" });
	});
	return sent;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

const SETTINGS: Settings = {
	resendApiKey: "re_test_not_a_real_key",
	resendFrom: "Findlay Masonic Temple <web@example.test>",
	segmentId: "seg",
	topicId: "topic",
	testAllowlist: "admin@example.test, editor@example.test",
	turnstileSecret: undefined,
	siteEnv: undefined,
};

/** EmDash's `email:deliver` hook as the newsletter plugin registers it, for a Worker with `env`. */
function deliver(siteEnv: string | undefined) {
	const { mailer, config } = realRuntime({ ...SETTINGS, siteEnv });
	return transport(async () => ({ mailer, from: config.from }));
}

const message = (to: string, cc?: string[]): EmailDeliverEvent => ({
	message: { to, subject: "Website message", text: "Hello", ...(cc ? { cc } : {}) },
	source: "system",
});

describe("non-production email reaches only the allowlist (M4 verification N1)", () => {
	it.each([
		["unset (local dev)", undefined],
		["staging", "staging"],
		["a misspelling", "prod"],
		["the wrong case", "Production"],
	])("refuses a contact message or invite to a visitor when SITE_ENV is %s", async (_, env) => {
		const sent = resendApi();
		await expect(deliver(env)(message("visitor@example.test"))).rejects.toThrow(
			"not the production site",
		);
		expect(sent).toEqual([]);
	});

	it("refuses the whole email when one cc is off the list", async () => {
		const sent = resendApi();
		await expect(
			deliver("staging")(message("admin@example.test", ["secretary@example.test"])),
		).rejects.toThrow("1 recipient(s)");
		expect(sent).toEqual([]);
	});

	it("delivers to an allowlisted inbox and to Resend's test addresses outside production", async () => {
		const sent = resendApi();
		await deliver("staging")(message("Admin@Example.test"));
		await deliver(undefined)(message("delivered+invite@resend.dev"));
		expect(sent).toEqual(["Admin@Example.test", "delivered+invite@resend.dev"]);
	});

	it("delivers to anyone in production", async () => {
		const sent = resendApi();
		await deliver("production")(message("visitor@example.test", ["secretary@example.test"]));
		expect(sent).toEqual(["visitor@example.test"]);
	});

	it("leaves newsletter test sends, which go to the allowlist, working on staging", async () => {
		const sent = resendApi();
		const { mailer, config } = realRuntime({ ...SETTINGS, siteEnv: "staging" });
		if (mailer === null) throw new Error("Resend is configured, so there is a mailer");
		const email = { from: config.from ?? "", subject: "[Test] Spring", text: "Hi" };
		const refused = await mailer.sendEmail({ ...email, to: ["subscriber@example.test"] });
		const passed = await mailer.sendEmail({ ...email, to: config.testAllowlist });
		expect([refused.ok, passed.ok]).toEqual([false, true]);
		expect(sent).toEqual(["admin@example.test", "editor@example.test"]);
	});
});

describe("parseSiteEnv and offAllowlist", () => {
	it("treats only the exact value production as production", () => {
		expect(parseSiteEnv("production")).toBe("production");
		expect(parseSiteEnv(" production ")).toBe("production");
		for (const raw of [undefined, "", "staging", "local", "PRODUCTION", "production2"]) {
			expect(parseSiteEnv(raw)).toBe("non-production");
		}
	});

	it("lists every to and cc address that is neither allowlisted nor a Resend test inbox", () => {
		const email = {
			from: "x@example.test",
			to: ["a@example.test", "bounced@resend.dev"],
			cc: ["b@example.test", "c@example.test"],
			subject: "s",
			text: "t",
		};
		expect(offAllowlist(email, ["B@example.test"])).toEqual(["a@example.test", "c@example.test"]);
	});
});
