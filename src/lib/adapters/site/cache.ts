import { secondsToMidnight } from "@core/time";
import type { CacheHint } from "emdash";
import type { Temporal } from "temporal-polyfill";

/** How long a cached copy of a page may live, in seconds. */
export interface Expiry {
	readonly maxAge: number;
}

/** The part of Astro's `Astro.cache` a route uses. */
export interface RouteCache {
	readonly enabled: boolean;
	set(input: CacheHint | Expiry | false): void;
}

/**
 * Content pages: EmDash purges a page's tags when what it shows is published, unpublished or
 * edited, so the expiry only bounds how long a missed purge can last.
 */
export const CONTENT: Expiry = { maxAge: 60 * 60 };

const CLOCK_MAX_AGE = 15 * 60;

/**
 * Pages that show what comes next or what is on today ("Today", "Tonight", the next meeting) go
 * stale as the clock moves, not only when content is published. Their cached copy lasts fifteen
 * minutes, and never past the next local midnight in the Temple's time zone. No route sets a
 * stale-while-revalidate window, so nothing older is served after it.
 */
export function clockBound(now: Temporal.Instant): Expiry {
	return { maxAge: Math.min(CLOCK_MAX_AGE, secondsToMidnight(now)) };
}

/**
 * The newsletter archive reads plugin storage, which carries no cache tags, so nothing purges
 * it when an issue is approved; it expires instead.
 */
export const UNTAGGED: Expiry = { maxAge: 5 * 60 };

/**
 * Register the content a route read, so publishing invalidates its cached copy, and how long a
 * copy may live. A no-op under `astro dev` and without a cache provider. Responses for a
 * signed-in user, or that set a cookie, are taken back out of the cache by src/middleware.ts.
 */
export function cacheRoute(
	cache: RouteCache | undefined,
	hints: readonly CacheHint[],
	expiry: Expiry = CONTENT,
): void {
	if (cache?.enabled !== true) return;
	for (const hint of hints) cache.set(hint);
	cache.set(expiry);
}
