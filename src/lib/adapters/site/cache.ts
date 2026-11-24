import type { CacheHint } from "emdash";

/** The part of Astro's `Astro.cache` a route uses. */
export interface RouteCache {
	readonly enabled: boolean;
	set(input: CacheHint | { readonly maxAge: number } | false): void;
}

/**
 * Content pages: EmDash purges a page's tags when what it shows is published, unpublished or
 * edited, so the expiry only bounds how long a missed purge can last.
 */
export const CONTENT = { maxAge: 60 * 60 } as const;

/**
 * Pages that show what comes next (meetings, upcoming events, today in a month grid) go stale
 * as the clock moves, not only when content is published, so their cached copy expires.
 */
export const CLOCK_BOUND = { maxAge: 15 * 60 } as const;

/**
 * The newsletter archive reads plugin storage, which carries no cache tags, so nothing purges
 * it when an issue is approved; it expires instead.
 */
export const UNTAGGED = { maxAge: 5 * 60 } as const;

/**
 * Register the content a route read, so publishing invalidates its cached copy, and how long a
 * copy may live. A no-op under `astro dev` and without a cache provider. Responses for a
 * signed-in user, or that set a cookie, are taken back out of the cache by src/middleware.ts.
 */
export function cacheRoute(
	cache: RouteCache | undefined,
	hints: readonly CacheHint[],
	expiry: { readonly maxAge: number } = CONTENT,
): void {
	if (cache?.enabled !== true) return;
	for (const hint of hints) cache.set(hint);
	cache.set(expiry);
}
