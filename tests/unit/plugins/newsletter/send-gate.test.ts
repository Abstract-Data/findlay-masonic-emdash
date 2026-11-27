import { dummyVerifier } from "@adapters/dev-fakes";
import { offAllowlist, parseSiteEnv } from "@adapters/send-gate";
import { DUMMY_TURNSTILE_TOKEN, TURNSTILE_FIELD } from "@adapters/turnstile";
import { kvRateLimiter } from "@plugins/newsletter/rate-limit";
import { realRuntime, type Settings } from "@plugins/newsletter/runtime";
import {
	subscribe,
	SUBSCRIBE_LIMIT,
	type SubscribeDeps,
	type SubscribeRequest,
} from "@plugins/newsletter/subscribe";
import { transport } from "@plugins/newsletter/transport";
import type { EmailDeliverEvent } from "emdash";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryCounter } from "./memory-counter";

/** Every request the Resend SDK makes, answered as a successful send. */
function resendApi(): string[] {
	const sent: string[] = [];
	vi.stubGlobal("fetch", async (_: string, init: RequestInit = {}) => {
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

	it("counts a recipient that is not exactly one address as off the list (M7 review L4)", () => {
		const smuggled = [
			"victim@example.com,delivered@resend.dev",
			"victim@example.com, admin@example.test",
			"Victim <victim@example.com> delivered@resend.dev",
			"admin@example.test\nvictim@example.com",
		];
		const email = { from: "x@example.test", to: smuggled, subject: "s", text: "t" };
		expect(offAllowlist(email, ["admin@example.test"])).toEqual(smuggled);
	});

	it("sends nothing to a smuggled pair on staging", async () => {
		const sent = resendApi();
		await expect(
			deliver("staging")(message("victim@example.com,delivered@resend.dev")),
		).rejects.toThrow("not the production site");
		expect(sent).toEqual([]);
	});
});

interface ApiCall {
	readonly method: string;
	readonly path: string;
}

/** Resend's HTTP API, answering each request from `answer`; records every request made. */
function resendRoutes(answer: (call: ApiCall) => { status: number; body: unknown }): ApiCall[] {
	const calls: ApiCall[] = [];
	vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
		const url = new URL(input);
		const call = { method: init.method ?? "GET", path: url.pathname + url.search };
		calls.push(call);
		const { status, body } = answer(call);
		return Response.json(body, { status });
	});
	return calls;
}

const NOT_FOUND = {
	status: 404,
	body: { name: "not_found", message: "Contact not found", statusCode: 404 },
};
const CREATED = { status: 200, body: { object: "contact", id: "c" } };

/** The Worker's mailer for a site whose SITE_ENV is `siteEnv`. */
function workerMailer(siteEnv: string | undefined) {
	const { mailer } = realRuntime({ ...SETTINGS, siteEnv });
	if (mailer === null) throw new Error("Resend is configured, so there is a mailer");
	return mailer;
}

function signupDeps(siteEnv: string | undefined): SubscribeDeps {
	return {
		mailer: workerMailer(siteEnv),
		verifier: dummyVerifier,
		segmentId: "seg",
		newsletterTopicId: "topic",
		bodyTopics: new Map(),
		limiter: kvRateLimiter(memoryCounter(), () => 0, SUBSCRIBE_LIMIT),
	};
}

const signup = (email: string): SubscribeRequest => ({
	origin: "https://findlaymason.org",
	csrfHeader: null,
	siteOrigins: ["https://findlaymason.org"],
	remoteIp: "203.0.113.9",
	fields: [
		{ name: "email", value: email },
		{ name: TURNSTILE_FIELD, value: DUMMY_TURNSTILE_TOKEN },
	],
});

const writes = (calls: readonly ApiCall[]) => calls.filter((call) => call.method !== "GET");

describe("non-production signups reach only the allowlist (M7 review B1)", () => {
	it("refuses a stranger's signup on staging before Resend hears of it, and says why", async () => {
		const calls = resendRoutes(() => NOT_FOUND);
		expect(await subscribe(signupDeps("staging"), signup("stranger@example.test"))).toBe(
			"test-site",
		);
		expect(await subscribe(signupDeps(undefined), signup("stranger@example.test"))).toBe(
			"test-site",
		);
		expect(calls).toEqual([]);
	});

	it("signs up allowlisted inboxes and Resend test addresses on staging", async () => {
		const calls = resendRoutes((call) => (call.method === "GET" ? NOT_FOUND : CREATED));
		expect(await subscribe(signupDeps("staging"), signup("Admin@Example.test"))).toBe("ok");
		expect(await subscribe(signupDeps("staging"), signup("delivered@resend.dev"))).toBe("ok");
		expect(writes(calls).map((call) => call.path)).toEqual(["/contacts", "/contacts"]);
	});

	it("signs anyone up in production", async () => {
		const calls = resendRoutes((call) => (call.method === "GET" ? NOT_FOUND : CREATED));
		expect(await subscribe(signupDeps("production"), signup("stranger@example.test"))).toBe("ok");
		expect(writes(calls).map((call) => call.path)).toEqual(["/contacts"]);
	});
});

const BROADCAST = {
	name: "fm-issue:00000000-0000-4000-8000-000000000001:rev:2",
	segmentId: "seg",
	topicId: "topic",
	from: "Findlay Masonic Temple <web@example.test>",
	subject: "Spring",
	previewText: "",
	html: "<p>Hi</p>",
	text: "Hi",
	scheduledAt: null,
};

/** Resend holding Segment "seg", listed a page per argument, and draft Broadcast "b-1" to it. */
function segmentOf(...pages: (readonly string[])[]) {
	return resendRoutes((call) => {
		if (call.method === "GET" && call.path.startsWith("/segments/seg/contacts")) {
			const after = /after=last-(\d+)/.exec(call.path)?.[1];
			const index = after === undefined ? 0 : Number(after) + 1;
			const page = pages[index] ?? [];
			const data = page.map((email, n) => ({
				id: n === page.length - 1 ? `last-${index}` : `c-${index}-${n}`,
				email,
			}));
			return {
				status: 200,
				body: { object: "list", has_more: index < pages.length - 1, data },
			};
		}
		if (call.method === "GET" && call.path === "/broadcasts/b-1") {
			return { status: 200, body: { object: "broadcast", id: "b-1", segment_id: "seg" } };
		}
		return { status: 200, body: { id: "b-1" } };
	});
}

describe("non-production Broadcasts go only to a Segment of allowlisted inboxes (M7 review B1)", () => {
	it("refuses to create a Broadcast when any page of the Segment holds an address off the list", async () => {
		const calls = segmentOf(["admin@example.test"], ["stranger@example.test"]);
		const created = await workerMailer("staging").createBroadcast(BROADCAST);
		expect(created).toMatchObject({ ok: false, error: { kind: "blocked" } });
		expect(writes(calls)).toEqual([]);
	});

	it("creates the Broadcast when every contact in the Segment is allowlisted", async () => {
		const calls = segmentOf(
			["admin@example.test", "bounced+x@resend.dev"],
			["EDITOR@example.test"],
		);
		expect(await workerMailer("staging").createBroadcast(BROADCAST)).toEqual({
			ok: true,
			value: { id: "b-1" },
		});
		expect(writes(calls).map((call) => call.path)).toEqual(["/broadcasts"]);
	});

	it("refuses when the Segment or the Broadcast cannot be read", async () => {
		const calls = resendRoutes((call) =>
			call.method === "GET"
				? {
						status: 500,
						body: { name: "internal_server_error", message: "Oops", statusCode: 500 },
					}
				: { status: 200, body: { id: "b-1" } },
		);
		expect((await workerMailer("staging").createBroadcast(BROADCAST)).ok).toBe(false);
		expect((await workerMailer("staging").sendBroadcast("b-1", null)).ok).toBe(false);
		expect(writes(calls)).toEqual([]);
	});

	it("refuses to send a Resend draft Broadcast whose Segment holds an address off the list", async () => {
		const calls = segmentOf(["stranger@example.test"]);
		const sent = await workerMailer("staging").sendBroadcast("b-1", null);
		expect(sent).toMatchObject({ ok: false, error: { kind: "blocked" } });
		expect(writes(calls)).toEqual([]);
	});

	it.each([
		["omits segment_id", { object: "broadcast", id: "b-1" }],
		["has an empty segment_id", { object: "broadcast", id: "b-1", segment_id: "" }],
		["has a blank segment_id", { object: "broadcast", id: "b-1", segment_id: "  " }],
		[
			"has a zero-width segment_id",
			{ object: "broadcast", id: "b-1", segment_id: "\u200B\u200C\u200D\uFEFF" },
		],
	])(
		"refuses a Broadcast whose Resend record %s, without listing the account's contacts",
		async (_, record) => {
			const calls = resendRoutes((call) => {
				if (call.path === "/broadcasts/b-1") return { status: 200, body: record };
				if (call.path.startsWith("/contacts")) {
					const data = [{ id: "c-1", email: "admin@example.test" }];
					return { status: 200, body: { object: "list", has_more: false, data } };
				}
				return { status: 200, body: { id: "b-1" } };
			});
			const sent = await workerMailer("staging").sendBroadcast("b-1", null);
			expect(sent).toMatchObject({ ok: false, error: { kind: "blocked" } });
			expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(["GET /broadcasts/b-1"]);
		},
	);

	it.each([" ", "\u200B", " \u200C\u200D "])(
		"refuses to create a Broadcast to a blank Segment id %j, without listing anything",
		async (segmentId) => {
			const calls = segmentOf(["admin@example.test"]);
			const created = await workerMailer("staging").createBroadcast({ ...BROADCAST, segmentId });
			expect(created).toMatchObject({ ok: false, error: { kind: "blocked" } });
			expect(calls).toEqual([]);
		},
	);

	it("sends a Resend draft Broadcast whose Segment is all allowlisted", async () => {
		const calls = segmentOf(["admin@example.test"]);
		expect((await workerMailer("staging").sendBroadcast("b-1", null)).ok).toBe(true);
		expect(writes(calls).map((call) => call.path)).toEqual(["/broadcasts/b-1/send"]);
	});

	it("creates and sends in production without listing the Segment", async () => {
		const calls = segmentOf(["stranger@example.test"]);
		const mailer = workerMailer("production");
		expect((await mailer.createBroadcast(BROADCAST)).ok).toBe(true);
		expect((await mailer.sendBroadcast("b-1", null)).ok).toBe(true);
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"POST /broadcasts",
			"POST /broadcasts/b-1/send",
		]);
	});
});
