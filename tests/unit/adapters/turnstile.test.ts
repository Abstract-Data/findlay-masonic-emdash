import { dummyVerifier } from "@adapters/dev-fakes";
import { DUMMY_TURNSTILE_TOKEN, SITEVERIFY_URL, siteverify } from "@adapters/turnstile";
import { describe, expect, it } from "vitest";

interface Seen {
	readonly url: string;
	readonly form: URLSearchParams;
}

/** Cloudflare's siteverify endpoint: records the form it receives and answers `outcome`. */
function fakeSiteverify(outcome: unknown) {
	const seen: Seen[] = [];
	const fetchFn = async (url: string, init: RequestInit) => {
		seen.push({
			url,
			form: init.body instanceof URLSearchParams ? init.body : new URLSearchParams(),
		});
		if (outcome === "network-down") throw new TypeError("fetch failed");
		return Response.json(outcome);
	};
	return { seen, fetchFn };
}

/** The signup form on the site, as the subscribe route expects a token to come from it. */
const SIGNUP = {
	hostnames: ["findlaymason.org", "findlay.example.workers.dev"],
	action: "subscribe",
};
/** What siteverify answers for a token solved in the signup form on the site. */
const SOLVED = { success: true, hostname: "findlaymason.org", action: "subscribe" };

describe("Turnstile tokens are for this site's form (M7 review L7)", () => {
	it("passes a token solved in this form on one of the site's hostnames", async () => {
		const api = fakeSiteverify({ ...SOLVED, hostname: "findlay.example.workers.dev" });
		expect(await siteverify("s", api.fetchFn).verify("t", null, SIGNUP)).toEqual({ ok: true });
	});

	it.each([
		["another site", { ...SOLVED, hostname: "evil.example" }, "hostname-mismatch"],
		["no hostname, as a test secret key answers", { success: true }, "hostname-mismatch"],
		["the contact form", { ...SOLVED, action: "contact" }, "action-mismatch"],
		["a widget with no action", { success: true, hostname: "findlaymason.org" }, "action-mismatch"],
	])("refuses a token solved on %s", async (_, outcome, code) => {
		const api = fakeSiteverify(outcome);
		expect(await siteverify("s", api.fetchFn).verify("t", null, SIGNUP)).toEqual({
			ok: false,
			reason: "rejected",
			codes: [code],
		});
	});
});

describe("Turnstile siteverify (spec Q7)", () => {
	it("passes a token Cloudflare accepts, sending the secret, token and visitor IP", async () => {
		const api = fakeSiteverify({ ...SOLVED, "error-codes": [] });
		const verdict = await siteverify("secret-x", api.fetchFn).verify(
			"token-1",
			"203.0.113.9",
			SIGNUP,
		);
		expect(verdict).toEqual({ ok: true });
		expect(api.seen[0]?.url).toBe(SITEVERIFY_URL);
		expect(Object.fromEntries(api.seen[0]?.form ?? [])).toEqual({
			secret: "secret-x",
			response: "token-1",
			remoteip: "203.0.113.9",
		});
	});

	it("refuses a token Cloudflare rejects", async () => {
		const api = fakeSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
		expect(await siteverify("secret-x", api.fetchFn).verify("forged", null, SIGNUP)).toEqual({
			ok: false,
			reason: "rejected",
			codes: ["invalid-input-response"],
		});
	});

	it("refuses a missing or oversized token without calling Cloudflare", async () => {
		const api = fakeSiteverify({ success: true });
		const verifier = siteverify("secret-x", api.fetchFn);
		expect(await verifier.verify(null, null, SIGNUP)).toMatchObject({
			ok: false,
			reason: "missing-token",
		});
		expect(await verifier.verify("", null, SIGNUP)).toMatchObject({
			ok: false,
			reason: "missing-token",
		});
		expect(await verifier.verify("x".repeat(2049), null, SIGNUP)).toMatchObject({
			ok: false,
			reason: "missing-token",
		});
		expect(api.seen).toHaveLength(0);
	});

	it("treats an unreachable or failing siteverify as unavailable, never as a pass", async () => {
		const down = fakeSiteverify("network-down");
		expect(await siteverify("s", down.fetchFn).verify("t", null, SIGNUP)).toMatchObject({
			ok: false,
			reason: "unavailable",
		});
		const failing = fakeSiteverify({ success: false, "error-codes": ["internal-error"] });
		expect(await siteverify("s", failing.fetchFn).verify("t", null, SIGNUP)).toMatchObject({
			ok: false,
			reason: "unavailable",
		});
		const garbled = fakeSiteverify("not json object");
		expect(await siteverify("s", garbled.fetchFn).verify("t", null, SIGNUP)).toMatchObject({
			ok: false,
		});
	});

	it("the dev stand-in accepts only Cloudflare's published test token", async () => {
		expect(await dummyVerifier.verify(DUMMY_TURNSTILE_TOKEN, null, SIGNUP)).toEqual({ ok: true });
		expect(await dummyVerifier.verify("real-looking-token", null, SIGNUP)).toMatchObject({
			ok: false,
		});
		expect(await dummyVerifier.verify(null, null, SIGNUP)).toMatchObject({
			ok: false,
			reason: "missing-token",
		});
	});
});
