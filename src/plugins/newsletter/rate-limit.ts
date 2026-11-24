import { log, messageOf } from "@adapters/log";

/** The slice of a plugin's KV store the limiter uses. */
export interface CounterStore {
	getVersioned(key: string): Promise<{ value: unknown; revision: string } | null>;
	compareAndSet(
		key: string,
		expectedRevision: string | null,
		value: unknown,
	): Promise<{ applied: boolean }>;
	compareAndDelete(key: string, expectedRevision: string): Promise<{ applied: boolean }>;
	list(prefix: string): Promise<{ key: string; value: unknown }[]>;
}

/** Requests one sender may make to one target, and all senders together, per window. */
export interface FormLimit {
	/** The KV key prefix, so each form counts apart and a dev reset finds every counter. */
	readonly namespace: string;
	readonly perSender: number;
	readonly perTarget: number;
	readonly windowSeconds: number;
}

export type LimitVerdict =
	| { readonly ok: true }
	| { readonly ok: false; readonly limit: "sender" | "target" };

export interface RateLimiter {
	/** Counts one request from `ip` (null when no trusted IP) to `target`. */
	allow(ip: string | null, target: string): Promise<LimitVerdict>;
}

interface Window {
	readonly start: number;
	readonly count: number;
}

const ATTEMPTS = 3;
/**
 * Stale counters one sweep deletes, two queries each: few enough to fit beside the request's
 * own queries in a Worker's per-invocation D1 query limit. A backlog drains over later windows.
 */
const SWEEP_BATCH = 20;

/**
 * A fixed-window count per sender and target, then per target across every sender, in plugin
 * KV. The sender is the client's network (an IPv6 /64, which one household or host holds, or an
 * IPv4 address), and keys are a SHA-256 of it, never the address. The sender's count goes first,
 * so one flooding network is refused before it eats into the target's shared allowance. Writes
 * are compare-and-set; a key that stays contended counts as over the limit.
 *
 * The store has no expiry, so the first request in a target's new window deletes every counter
 * of this form from an earlier window (a few reads an hour per target); without it each network
 * that ever posted would keep a row.
 */
export function kvRateLimiter(
	store: CounterStore,
	now: () => number,
	limit: FormLimit,
): RateLimiter {
	const prefix = `${limit.namespace}:`;
	/** Counts one request; `fresh` when it began the key's count for this window. */
	const count = async (key: string, max: number, start: number) => {
		const id = `${prefix}${await sha256(key)}`;
		for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
			// oxlint-disable-next-line no-await-in-loop -- each retry follows a lost compare-and-set.
			const current = await store.getVersioned(id);
			const counted = (current === null ? null : countIn(current.value, start)) ?? 0;
			if (counted >= max) return { allowed: false, fresh: false };
			// oxlint-disable-next-line no-await-in-loop -- see above.
			const written = await store.compareAndSet(id, current?.revision ?? null, {
				start,
				count: counted + 1,
			} satisfies Window);
			if (written.applied) return { allowed: true, fresh: counted === 0 };
		}
		return { allowed: false, fresh: false };
	};
	const sweep = async (start: number) => {
		const listed = await store.list(prefix);
		const stale = listed.filter(({ value }) => countIn(value, start) === null);
		await Promise.all(
			stale.slice(0, SWEEP_BATCH).map(async ({ key }) => {
				const row = await store.getVersioned(key);
				if (row !== null && countIn(row.value, start) === null) {
					await store.compareAndDelete(key, row.revision);
				}
			}),
		);
	};
	return {
		async allow(ip, target) {
			const start = Math.floor(now() / 1000 / limit.windowSeconds) * limit.windowSeconds;
			const sender = JSON.stringify(["sender", clientNetwork(ip), target]);
			if (!(await count(sender, limit.perSender, start)).allowed) {
				return { ok: false, limit: "sender" };
			}
			const counted = await count(JSON.stringify(["target", target]), limit.perTarget, start);
			if (counted.fresh) {
				// A sweep that fails leaves its rows to the next one; the request it rode on stands.
				await sweep(start).catch((error: unknown) =>
					log({ event: "form.sweep_failed", namespace: limit.namespace, error: messageOf(error) }),
				);
			}
			return counted.allowed ? { ok: true } : { ok: false, limit: "target" };
		},
	};
}

/** The stored count when it belongs to this window; an older window or other value counts 0. */
function countIn(value: unknown, start: number): number | null {
	if (typeof value !== "object" || value === null) return null;
	const stored: unknown = Reflect.get(value, "start");
	const count: unknown = Reflect.get(value, "count");
	return stored === start && typeof count === "number" ? count : null;
}

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HEXTET = /^[\da-f]{1,4}$/;

/**
 * The network a request counts against: an IPv4 address as it is, an IPv6 address by its /64
 * (an ISP hands a whole /64 to one customer, so the host bits are free to rotate), an
 * IPv4-mapped IPv6 address as its IPv4 address, and no trusted IP as one shared "unknown".
 * Anything that does not parse counts as itself.
 */
export function clientNetwork(ip: string | null): string {
	if (ip === null) return "unknown";
	const address = ip.trim().toLowerCase();
	if (!address.includes(":")) return address;
	const hextets = expandIpv6(address);
	if (hextets === null) return address;
	if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
		const [high = 0, low = 0] = hextets.slice(6);
		return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
	}
	return `${hextets
		.slice(0, 4)
		.map((h) => h.toString(16))
		.join(":")}::/64`;
}

const groups = (part: string | undefined) =>
	part === undefined || part === "" ? [] : part.split(":");

function expandIpv6(address: string): number[] | null {
	const halves = address.split("::");
	if (halves.length > 2) return null;
	const head = groups(halves[0]);
	const tail = groups(halves[1]);
	const last = tail.at(-1) ?? (halves.length === 1 ? head.at(-1) : undefined);
	const embedded = last !== undefined && IPV4.test(last) ? last : null;
	const list = halves.length === 1 ? head : tail;
	if (embedded !== null) {
		const octets = embedded.split(".").map(Number);
		if (octets.some((octet) => octet > 255)) return null;
		const [a = 0, b = 0, c = 0, d = 0] = octets;
		list.splice(-1, 1, ((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
	}
	if (!head.concat(tail).every((group) => HEXTET.test(group))) return null;
	const missing = 8 - head.length - tail.length;
	if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
	return [
		...head,
		...Array.from({ length: halves.length === 1 ? 0 : missing }, () => "0"),
		...tail,
	].map((group) => Number.parseInt(group, 16));
}
