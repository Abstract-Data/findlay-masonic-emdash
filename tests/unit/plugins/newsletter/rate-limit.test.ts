import { CONTACT_LIMIT } from "@plugins/newsletter/contact";
import {
	clientNetwork,
	kvRateLimiter,
	type CounterStore,
	type FormLimit,
} from "@plugins/newsletter/rate-limit";
import { describe, expect, it } from "vitest";
import { memoryCounter } from "./memory-counter";

const ONE_A_MINUTE: FormLimit = { namespace: "t", perSender: 1, perTarget: 10, windowSeconds: 60 };

/** Outcomes of `n` requests in order, as "ok" or the limit that refused. */
async function run(
	limiter: ReturnType<typeof kvRateLimiter>,
	requests: readonly (readonly [string | null, string])[],
): Promise<string[]> {
	const outcomes: string[] = [];
	for (const [ip, target] of requests) {
		// oxlint-disable-next-line no-await-in-loop -- the limit counts requests in order.
		const verdict = await limiter.allow(ip, target);
		outcomes.push(verdict.ok ? "ok" : verdict.limit);
	}
	return outcomes;
}

describe("form rate limits (M4 verification N2)", () => {
	it("caps one body at thirty messages an hour from everyone, five from one network", async () => {
		expect(CONTACT_LIMIT).toEqual({
			namespace: "contact-rate",
			perSender: 5,
			perTarget: 30,
			windowSeconds: 3600,
		});
		const limiter = kvRateLimiter(memoryCounter(), () => 0, CONTACT_LIMIT);
		const senders = Array.from({ length: 31 }, (_, i) => [`198.51.100.${i}`, "lodge"] as const);
		const outcomes = await run(limiter, senders);
		expect(outcomes.slice(0, 30).every((o) => o === "ok")).toBe(true);
		expect(outcomes[30]).toBe("target");
		expect(await run(limiter, [["203.0.113.1", "chapter"]])).toEqual(["ok"]);
	});

	it("counts a whole IPv6 /64 as one sender, so rotating host bits gains nothing", async () => {
		const limiter = kvRateLimiter(memoryCounter(), () => 0, CONTACT_LIMIT);
		const hosts = Array.from(
			{ length: 6 },
			(_, i) => [`2001:db8:a:b:${i + 1}::${i + 7}`, "lodge"] as const,
		);
		expect(await run(limiter, hosts)).toEqual(["ok", "ok", "ok", "ok", "ok", "sender"]);
		expect(await run(limiter, [["2001:db8:a:c::1", "lodge"]])).toEqual(["ok"]);
	});

	it("refuses a flooding network before it uses up the body's shared allowance", async () => {
		const counter = memoryCounter();
		const limiter = kvRateLimiter(counter, () => 0, CONTACT_LIMIT);
		await run(
			limiter,
			Array.from({ length: 20 }, () => ["198.51.100.1", "lodge"] as const),
		);
		const others = Array.from({ length: 25 }, (_, i) => [`192.0.2.${i}`, "lodge"] as const);
		expect((await run(limiter, others)).filter((o) => o === "ok")).toHaveLength(25);
	});

	it("starts a new count in the next window", async () => {
		let now = 0;
		const limiter = kvRateLimiter(memoryCounter(), () => now, ONE_A_MINUTE);
		expect(
			await run(limiter, [
				["a", "lodge"],
				["a", "lodge"],
			]),
		).toEqual(["ok", "sender"]);
		now = 60_000;
		expect(await run(limiter, [["a", "lodge"]])).toEqual(["ok"]);
	});

	it("shares one sender among requests without a trusted IP", async () => {
		const limiter = kvRateLimiter(memoryCounter(), () => 0, ONE_A_MINUTE);
		expect(
			await run(limiter, [
				[null, "lodge"],
				[null, "lodge"],
			]),
		).toEqual(["ok", "sender"]);
	});

	it("never stores the address itself, only under the form's namespace", async () => {
		const counter = memoryCounter();
		await kvRateLimiter(counter, () => 0, CONTACT_LIMIT).allow("203.0.113.9", "lodge");
		expect(JSON.stringify([...counter.rows])).not.toContain("203.0.113.9");
		expect([...counter.rows.keys()].every((key) => key.startsWith("contact-rate:"))).toBe(true);
	});

	it("counts a key that stays contended as over the limit", async () => {
		const store: CounterStore = {
			getVersioned: async () => null,
			compareAndSet: async () => ({ applied: false }),
		};
		expect(await kvRateLimiter(store, () => 0, CONTACT_LIMIT).allow("a", "lodge")).toEqual({
			ok: false,
			limit: "sender",
		});
	});

	it("treats a stored value it cannot read as no count", async () => {
		const store: CounterStore = {
			getVersioned: async () => ({ value: "garbage", revision: "1" }),
			compareAndSet: async () => ({ applied: true }),
		};
		expect(await kvRateLimiter(store, () => 0, CONTACT_LIMIT).allow("a", "lodge")).toEqual({
			ok: true,
		});
	});
});

describe("clientNetwork", () => {
	it.each([
		[null, "unknown"],
		["198.51.100.7", "198.51.100.7"],
		["2001:db8:a:b:c:d:e:f", "2001:db8:a:b::/64"],
		["2001:DB8:A:B::1", "2001:db8:a:b::/64"],
		["2001:0db8:000a:000b:0000:0000:0000:0001", "2001:db8:a:b::/64"],
		["2001:db8::1", "2001:db8:0:0::/64"],
		["::1", "0:0:0:0::/64"],
		["::", "0:0:0:0::/64"],
		["::ffff:198.51.100.7", "198.51.100.7"],
		["::ffff:c633:6407", "198.51.100.7"],
		["64:ff9b::198.51.100.7", "64:ff9b:0:0::/64"],
		["2001:db8:a:b:c:d:e:f:1", "2001:db8:a:b:c:d:e:f:1"],
		["2001::db8::1", "2001::db8::1"],
		["2001:db8::zzzz", "2001:db8::zzzz"],
		["::ffff:300.1.1.1", "::ffff:300.1.1.1"],
	])("%s counts as %s", (ip, network) => {
		expect(clientNetwork(ip)).toBe(network);
	});
});
