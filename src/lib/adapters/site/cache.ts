import type { CacheHint } from "emdash";

/** The part of Astro's `Astro.cache` a route uses. */
export interface RouteCache {
	readonly enabled: boolean;
	set(input: CacheHint | { readonly maxAge: number }): void;
}

/**
 * Pages that show what comes next (meetings, upcoming events, today in a month grid) go stale
 * as the clock moves, not only when content is published, so their cached copy expires.
 */
export const CLOCK_BOUND = { maxAge: 15 * 60 } as const;

/**
 * Register the content a route read, so publishing invalidates its cached copy, and an expiry
 * for clock-bound pages. A no-op until a cache provider is configured (M7).
 */
export function cacheRoute(
	cache: RouteCache | undefined,
	hints: readonly CacheHint[],
	expiry?: { readonly maxAge: number },
): void {
	if (cache?.enabled !== true) return;
	for (const hint of hints) cache.set(hint);
	if (expiry !== undefined) cache.set(expiry);
}
