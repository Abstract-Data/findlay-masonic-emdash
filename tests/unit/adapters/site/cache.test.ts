import {
	cacheRoute,
	clockBound,
	CONTENT,
	type Expiry,
	type RouteCache,
} from "@adapters/site/cache";
import { secondsToMidnight } from "@core/time";
import type { CacheHint } from "emdash";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vitest";
import { instant } from "../../fixtures";

/** What a route told the cache, in order. */
function recorder(enabled = true) {
	const calls: (CacheHint | Expiry | false)[] = [];
	const cache: RouteCache = { enabled, set: (input) => calls.push(input) };
	return { cache, calls };
}

/** The next local midnight in Findlay after `now`. */
const nextMidnight = (now: Temporal.Instant) =>
	now
		.toZonedDateTimeISO("America/New_York")
		.toPlainDate()
		.add({ days: 1 })
		.toZonedDateTime("America/New_York")
		.toInstant();

describe("secondsToMidnight", () => {
	it.each([
		["2026-11-24T04:59:30Z", 30],
		["2026-11-24T04:59:59.999Z", 0],
		["2026-11-24T05:00:00Z", 86_400],
		["2026-11-23T17:00:00Z", 43_200],
		// The day the clocks fall back is 25 hours long, the day they spring forward 23.
		["2026-11-01T04:00:00Z", 90_000],
		["2026-11-01T03:00:00Z", 3600],
		["2026-03-08T05:00:00Z", 82_800],
	])("from %s is %i seconds", (iso, seconds) => {
		expect(secondsToMidnight(instant(iso))).toBe(seconds);
	});
});

describe("clockBound: the home page never shows yesterday's Today or Tonight", () => {
	it("keeps a copy fifteen minutes in the day", () => {
		expect(clockBound(instant("2026-11-23T17:00:00Z"))).toEqual({ maxAge: 900 });
	});

	it("expires a copy made at 11:55 PM at midnight, five minutes later", () => {
		expect(clockBound(instant("2026-11-24T04:55:00Z"))).toEqual({ maxAge: 300 });
	});

	it("caches nothing in the last second before midnight", () => {
		expect(clockBound(instant("2026-11-24T04:59:59.500Z"))).toEqual({ maxAge: 0 });
	});

	it("never lets a copy outlive the local day it was made in, DST nights included", () => {
		const starts = [
			"2026-11-23T05:00:00Z",
			"2026-03-08T04:00:00Z",
			"2026-11-01T03:30:00Z",
			"2026-12-31T23:00:00Z",
		].map(instant);
		const checked: string[] = [];
		for (const start of starts) {
			for (let minutes = 0; minutes < 24 * 60; minutes += 7) {
				const now = start.add({ minutes, milliseconds: 250 });
				const { maxAge } = clockBound(now);
				const expires = now.add({ seconds: maxAge });
				if (Temporal.Instant.compare(expires, nextMidnight(now)) > 0) checked.push(now.toString());
				if (maxAge > 900) checked.push(`${now.toString()} beyond fifteen minutes`);
			}
		}
		expect(checked).toEqual([]);
	});
});

describe("cacheRoute", () => {
	it("registers each content hint, then the expiry", () => {
		const { cache, calls } = recorder();
		const expiry = clockBound(instant("2026-11-24T04:55:00Z"));
		cacheRoute(cache, [{ tags: ["bodies"] }, { tags: ["events"] }], expiry);
		expect(calls).toEqual([{ tags: ["bodies"] }, { tags: ["events"] }, { maxAge: 300 }]);
	});

	it("gives a page that does not depend on the clock the content expiry, an hour", () => {
		const { cache, calls } = recorder();
		cacheRoute(cache, [{ tags: ["news"] }]);
		expect(calls).toEqual([{ tags: ["news"] }, CONTENT]);
		expect(CONTENT).toEqual({ maxAge: 3600 });
	});

	it("does nothing until a cache provider is configured", () => {
		const { cache, calls } = recorder(false);
		cacheRoute(cache, [{ tags: ["news"] }], { maxAge: 900 });
		cacheRoute(undefined, [{ tags: ["news"] }]);
		expect(calls).toEqual([]);
	});
});
