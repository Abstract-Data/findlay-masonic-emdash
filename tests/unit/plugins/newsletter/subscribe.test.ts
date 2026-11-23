import { dummyVerifier, emptyOutbox, fakeMailer } from "@adapters/dev-fakes";
import type { Mailer } from "@adapters/resend-mailer";
import { DUMMY_TURNSTILE_TOKEN, TURNSTILE_FIELD } from "@adapters/turnstile";
import { err } from "@core/ids";
import {
	parseSignup,
	sameSite,
	subscribe,
	type SubscribeDeps,
	type SubscribeRequest,
} from "@plugins/newsletter/subscribe";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, bodyId } from "../../fixtures";

const SITE = "https://findlaymason.org";
const COUNCIL = bodyId(3);

function request(
	fields: Record<string, string | string[]>,
	extra: Partial<SubscribeRequest> = {},
): SubscribeRequest {
	return {
		origin: SITE,
		csrfHeader: null,
		siteOrigins: [SITE],
		remoteIp: "203.0.113.9",
		fields: Object.entries(fields).flatMap(([name, value]) =>
			(Array.isArray(value) ? value : [value]).map((v) => ({ name, value: v })),
		),
		...extra,
	};
}

function setup(overrides: Partial<SubscribeDeps> = {}) {
	const outbox = emptyOutbox();
	const deps: SubscribeDeps = {
		mailer: fakeMailer(outbox),
		verifier: dummyVerifier,
		segmentId: "seg-subscribers",
		newsletterTopicId: "topic-newsletter",
		bodyTopics: new Map<string, string | null>([
			[LODGE, "topic-lodge"],
			[CHAPTER, "topic-chapter"],
			[COUNCIL, null],
		]),
		...overrides,
	};
	return { deps, outbox };
}

const token = { [TURNSTILE_FIELD]: DUMMY_TURNSTILE_TOKEN };

describe("public subscribe (FR-7.1)", () => {
	it("puts the contact in the Segment with the newsletter Topic and each chosen body's Topic", async () => {
		const { deps, outbox } = setup();
		const outcome = await subscribe(
			deps,
			request({ email: " Brother@Example.TEST ", body: [LODGE, COUNCIL, LODGE], ...token }),
		);
		expect(outcome).toBe("ok");
		expect([...outbox.contacts]).toEqual([
			[
				"brother@example.test",
				{
					segments: new Set(["seg-subscribers"]),
					topics: new Set(["topic-newsletter", "topic-lodge"]),
				},
			],
		]);
	});

	it("subscribes to the newsletter alone when no body is chosen", async () => {
		const { deps, outbox } = setup();
		expect(await subscribe(deps, request({ email: "a@example.test", ...token }))).toBe("ok");
		expect(outbox.contacts.get("a@example.test")?.topics).toEqual(new Set(["topic-newsletter"]));
	});

	it.each([
		["a missing email", { ...token }],
		["a malformed email", { email: "not-an-email", ...token }],
		["an email too long", { email: `${"x".repeat(250)}@example.test`, ...token }],
		["a body that is not one of the Temple's", { email: "a@example.test", body: "01JX", ...token }],
	])("refuses %s without calling Resend", async (_, fields) => {
		const { deps, outbox } = setup();
		expect(await subscribe(deps, request(fields))).toBe("invalid");
		expect(outbox.contacts.size).toBe(0);
	});

	it.each([
		["no Turnstile token", {}],
		["a token Turnstile rejects", { [TURNSTILE_FIELD]: "forged" }],
	])("refuses %s without calling Resend", async (_, extra) => {
		const { deps, outbox } = setup();
		expect(await subscribe(deps, request({ email: "a@example.test", ...extra }))).toBe(
			"verification-failed",
		);
		expect(outbox.contacts.size).toBe(0);
	});

	it("reports unavailable when Resend or Turnstile is not configured or Resend fails", async () => {
		const failing: Mailer = {
			...fakeMailer(emptyOutbox()),
			upsertContact: async () => err({ kind: "unavailable", status: 503, message: "down" }),
		};
		const fields = { email: "a@example.test", ...token };
		expect(await subscribe(setup({ mailer: null }).deps, request(fields))).toBe("unavailable");
		expect(await subscribe(setup({ verifier: null }).deps, request(fields))).toBe("unavailable");
		expect(await subscribe(setup({ segmentId: null }).deps, request(fields))).toBe("unavailable");
		expect(await subscribe(setup({ mailer: failing }).deps, request(fields))).toBe("unavailable");
	});

	it("parses one email and the ticked bodies from the form fields", () => {
		expect(parseSignup(request({ email: "A@B.TEST", body: [LODGE, CHAPTER] }).fields)).toEqual({
			email: "a@b.test",
			bodies: [LODGE, CHAPTER],
		});
	});
});

describe("cross-site posts (FR-7.2)", () => {
	const base = { siteOrigins: [SITE, "https://staging.findlaymason.org"] };

	it("accepts the site's own Origin or the X-EmDash-Request header", () => {
		expect(sameSite({ ...base, origin: SITE, csrfHeader: null })).toBe(true);
		expect(
			sameSite({ ...base, origin: "https://staging.findlaymason.org", csrfHeader: null }),
		).toBe(true);
		expect(sameSite({ ...base, origin: "https://evil.example", csrfHeader: "1" })).toBe(true);
	});

	it("refuses another Origin, or no Origin, without the header", () => {
		expect(sameSite({ ...base, origin: "https://evil.example", csrfHeader: null })).toBe(false);
		expect(
			sameSite({ ...base, origin: "https://findlaymason.org.evil.example", csrfHeader: null }),
		).toBe(false);
		expect(sameSite({ ...base, origin: null, csrfHeader: null })).toBe(false);
		expect(sameSite({ ...base, origin: SITE.replace("https", "http"), csrfHeader: "0" })).toBe(
			false,
		);
	});
});
