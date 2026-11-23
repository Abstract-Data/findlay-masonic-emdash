import { TURNSTILE_FIELD, type TurnstileVerifier } from "@adapters/turnstile";
import { dummyVerifier } from "@adapters/dev-fakes";
import {
	contact,
	CONTACT_LIMIT,
	kvRateLimiter,
	type ContactBody,
	type ContactDeps,
	type CounterStore,
} from "@plugins/newsletter/contact";
import { returnPath } from "@plugins/newsletter/routes";
import type { EmailMessage } from "emdash";
import { describe, expect, it } from "vitest";

const LODGE: ContactBody = {
	name: "Findlay Lodge No. 227",
	recipients: ["secretary@example.test", "master@example.test"],
};

function memoryStore(): CounterStore {
	const rows = new Map<string, { value: unknown; revision: string }>();
	let revision = 0;
	return {
		async getVersioned(key) {
			return rows.get(key) ?? null;
		},
		async compareAndSet(key, expected, value) {
			if ((rows.get(key)?.revision ?? null) !== expected) return { applied: false };
			revision += 1;
			rows.set(key, { value, revision: String(revision) });
			return { applied: true };
		},
	};
}

function setup(overrides: Partial<ContactDeps> = {}) {
	const sent: EmailMessage[] = [];
	const deps: ContactDeps = {
		verifier: dummyVerifier,
		send: async (message) => {
			sent.push(message);
		},
		body: async (id) => (id === "lodge" ? LODGE : null),
		limiter: kvRateLimiter(memoryStore(), () => 0),
		siteName: "Findlay Masonic Temple",
		...overrides,
	};
	return { deps, sent };
}

const form = (overrides: Record<string, string> = {}) => ({
	remoteIp: "203.0.113.9",
	fields: Object.entries({
		body: "lodge",
		name: "Jane Visitor",
		email: "Jane@Example.test",
		message: "When do you meet?",
		[TURNSTILE_FIELD]: "XXXX.DUMMY.TOKEN.XXXX",
		...overrides,
	}).map(([name, value]) => ({ name, value })),
});

describe("contact (spec Q12)", () => {
	it("emails the body's private recipients, with replies going to the visitor", async () => {
		const { deps, sent } = setup();
		expect(await contact(deps, form())).toBe("sent");
		expect(sent).toEqual([
			{
				to: "secretary@example.test",
				cc: ["master@example.test"],
				replyTo: "jane@example.test",
				subject: "Website message for Findlay Lodge No. 227 from Jane Visitor",
				text: expect.stringContaining("When do you meet?"),
			},
		]);
		expect(sent[0]?.text).toContain("Findlay Masonic Temple website");
	});

	it("sends no cc when the body has one recipient", async () => {
		const { deps, sent } = setup({
			body: async () => ({ ...LODGE, recipients: ["secretary@example.test"] }),
		});
		await contact(deps, form());
		expect(sent[0]).not.toHaveProperty("cc");
	});

	it.each([
		["a missing name", { name: " " }],
		["a name with a line break", { name: "Jane\r\nBcc: x@example.test" }],
		["a bad email", { email: "not-an-email" }],
		["an empty message", { message: "  " }],
		["a message over 5000 characters", { message: "x".repeat(5001) }],
		["a missing body", { body: "" }],
	])("refuses %s without sending", async (_, overrides) => {
		const { deps, sent } = setup();
		expect(await contact(deps, form(overrides))).toBe("invalid");
		expect(sent).toEqual([]);
	});

	it("refuses a body that is not published", async () => {
		const { deps, sent } = setup();
		expect(await contact(deps, form({ body: "chapter" }))).toBe("invalid");
		expect(sent).toEqual([]);
	});

	it("refuses without a Turnstile token, or with a wrong one", async () => {
		const { deps, sent } = setup();
		expect(await contact(deps, form({ [TURNSTILE_FIELD]: "" }))).toBe("verification-failed");
		expect(await contact(deps, form({ [TURNSTILE_FIELD]: "forged" }))).toBe("verification-failed");
		expect(sent).toEqual([]);
	});

	it("is unavailable when Turnstile cannot answer, email is not set up, or the body has no recipients", async () => {
		const down: TurnstileVerifier = {
			async verify() {
				return { ok: false, reason: "unavailable", codes: [] };
			},
		};
		expect(await contact(setup({ verifier: down }).deps, form())).toBe("unavailable");
		expect(await contact(setup({ verifier: null }).deps, form())).toBe("unavailable");
		expect(await contact(setup({ send: null }).deps, form())).toBe("unavailable");
		const silent = setup({ body: async () => ({ ...LODGE, recipients: [] }) });
		expect(await contact(silent.deps, form())).toBe("unavailable");
		expect(silent.sent).toEqual([]);
	});

	it("is unavailable when delivery fails", async () => {
		const { deps } = setup({
			send: async () => {
				throw new Error("Resend did not accept the email");
			},
		});
		expect(await contact(deps, form())).toBe("unavailable");
	});

	it("stops a sender after five messages to a body in an hour, and lets others through", async () => {
		const { deps, sent } = setup({
			body: async () => LODGE,
		});
		const outcomes = [];
		for (let i = 0; i <= CONTACT_LIMIT.messages; i += 1) {
			// oxlint-disable-next-line no-await-in-loop -- the limit counts requests in order.
			outcomes.push(await contact(deps, form()));
		}
		expect(CONTACT_LIMIT).toEqual({ messages: 5, windowSeconds: 3600 });
		expect(outcomes).toEqual(["sent", "sent", "sent", "sent", "sent", "rate-limited"]);
		expect(sent).toHaveLength(5);
		expect(await contact(deps, { ...form(), remoteIp: "198.51.100.4" })).toBe("sent");
		expect(await contact(deps, form({ body: "chapter" }))).toBe("sent");
	});

	it("counts nothing for a body that is not published or takes no messages", async () => {
		let writes = 0;
		const store: CounterStore = {
			async getVersioned() {
				return null;
			},
			async compareAndSet() {
				writes += 1;
				return { applied: true };
			},
		};
		const limiter = kvRateLimiter(store, () => 0);
		await contact(setup({ limiter }).deps, form({ body: "chapter" }));
		const silent = setup({ limiter, body: async () => ({ ...LODGE, recipients: [] }) });
		await contact(silent.deps, form());
		expect(writes).toBe(0);
		expect(await contact(setup({ limiter }).deps, form())).toBe("sent");
		expect(writes).toBe(1);
	});

	it("does not count a message refused before sending", async () => {
		const { deps } = setup();
		for (let i = 0; i < CONTACT_LIMIT.messages; i += 1) {
			// oxlint-disable-next-line no-await-in-loop -- the limit counts requests in order.
			await contact(deps, form({ [TURNSTILE_FIELD]: "forged" }));
		}
		expect(await contact(deps, form())).toBe("sent");
	});
});

describe("kvRateLimiter", () => {
	it("starts a new count in the next window", async () => {
		let now = 0;
		const limiter = kvRateLimiter(memoryStore(), () => now, { messages: 1, windowSeconds: 60 });
		expect(await limiter.allow("a", "lodge")).toBe(true);
		expect(await limiter.allow("a", "lodge")).toBe(false);
		now = 60_000;
		expect(await limiter.allow("a", "lodge")).toBe(true);
	});

	it("shares one sender among requests without a trusted IP", async () => {
		const limiter = kvRateLimiter(memoryStore(), () => 0, { messages: 1, windowSeconds: 60 });
		expect(await limiter.allow(null, "lodge")).toBe(true);
		expect(await limiter.allow(null, "lodge")).toBe(false);
	});

	it("never stores the address itself", async () => {
		const rows = new Map<string, unknown>();
		const store: CounterStore = {
			async getVersioned() {
				return null;
			},
			async compareAndSet(key, _, value) {
				rows.set(key, value);
				return { applied: true };
			},
		};
		await kvRateLimiter(store, () => 0).allow("203.0.113.9", "lodge");
		expect(JSON.stringify([...rows])).not.toContain("203.0.113.9");
	});

	it("counts a key that stays contended as over the limit", async () => {
		const store: CounterStore = {
			async getVersioned() {
				return null;
			},
			async compareAndSet() {
				return { applied: false };
			},
		};
		expect(await kvRateLimiter(store, () => 0).allow("a", "lodge")).toBe(false);
	});

	it("treats a stored value it cannot read as no count", async () => {
		const store: CounterStore = {
			async getVersioned() {
				return { value: "garbage", revision: "1" };
			},
			async compareAndSet() {
				return { applied: true };
			},
		};
		expect(await kvRateLimiter(store, () => 0).allow("a", "lodge")).toBe(true);
	});
});

describe("returnPath", () => {
	it.each([
		["/bodies/blue-lodge", "/bodies/blue-lodge"],
		["/pages/contact", "/pages/contact"],
		["//evil.example", "/"],
		["https://evil.example/", "/"],
		["/bodies/x?contact=sent", "/"],
		["/\\evil.example", "/"],
		[undefined, "/"],
	])("sends %s back to %s", (raw, expected) => {
		expect(returnPath(raw)).toBe(expected);
	});
});
