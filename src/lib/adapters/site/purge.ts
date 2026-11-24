import { log, messageOf } from "@adapters/log";

/** The Workers cache's `purge` (`cache` from `cloudflare:workers`), as far as a purge needs it. */
export type CachePurge = (options: { readonly tags: string[] }) => Promise<{
	readonly success: boolean;
	readonly errors: readonly { readonly code: number; readonly message: string }[];
}>;

/**
 * Purge the edge copies of pages tagged with `tags`. A purge can fail without throwing: Cloudflare
 * answers `success: false` when it rate-limits one (Free tier limits, whatever the plan). Any
 * failure is logged, never thrown, so it cannot stop the publishing that asked for it; the pages
 * stay cached until their max-age, an hour at most (src/lib/adapters/site/cache.ts).
 */
export async function purgeTags(
	purge: CachePurge | undefined,
	tags: readonly string[],
): Promise<void> {
	if (tags.length === 0) return;
	const failed = (error: string) => log({ event: "cache.purge_failed", tags: tags.length, error });
	if (purge === undefined) {
		// Only a request or cron run on Cloudflare has a cache to purge; wrangler dev has none.
		failed("the Workers cache is not available here");
		return;
	}
	try {
		const result = await purge({ tags: [...tags] });
		if (!result.success) {
			failed(result.errors.map(({ code, message }) => `${code} ${message}`).join("; "));
		}
	} catch (error) {
		failed(messageOf(error));
	}
}
