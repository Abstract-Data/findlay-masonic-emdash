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

describe("Turnstile siteverify (spec Q7)", () => {
	it("passes a token Cloudflare accepts, sending the secret, token and visitor IP", async () => {
		const api = fakeSiteverify({ success: true, "error-codes": [] });
		const verdict = await siteverify("secret-x", api.fetchFn).verify("token-1", "203.0.113.9");
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
		expect(await siteverify("secret-x", api.fetchFn).verify("forged", null)).toEqual({
			ok: false,
			reason: "rejected",
			codes: ["invalid-input-response"],
		});
	});

	it("refuses a missing or oversized token without calling Cloudflare", async () => {
		const api = fakeSiteverify({ success: true });
		const verifier = siteverify("secret-x", api.fetchFn);
		expect(await verifier.verify(null, null)).toMatchObject({ ok: false, reason: "missing-token" });
		expect(await verifier.verify("", null)).toMatchObject({ ok: false, reason: "missing-token" });
		expect(await verifier.verify("x".repeat(2049), null)).toMatchObject({
			ok: false,
			reason: "missing-token",
		});
		expect(api.seen).toHaveLength(0);
	});

	it("treats an unreachable or failing siteverify as unavailable, never as a pass", async () => {
		const down = fakeSiteverify("network-down");
		expect(await siteverify("s", down.fetchFn).verify("t", null)).toMatchObject({
			ok: false,
			reason: "unavailable",
		});
		const failing = fakeSiteverify({ success: false, "error-codes": ["internal-error"] });
		expect(await siteverify("s", failing.fetchFn).verify("t", null)).toMatchObject({
			ok: false,
			reason: "unavailable",
		});
		const garbled = fakeSiteverify("not json object");
		expect(await siteverify("s", garbled.fetchFn).verify("t", null)).toMatchObject({ ok: false });
	});

	it("the dev stand-in accepts only Cloudflare's published test token", async () => {
		expect(await dummyVerifier.verify(DUMMY_TURNSTILE_TOKEN, null)).toEqual({ ok: true });
		expect(await dummyVerifier.verify("real-looking-token", null)).toMatchObject({ ok: false });
		expect(await dummyVerifier.verify(null, null)).toMatchObject({
			ok: false,
			reason: "missing-token",
		});
	});
});
