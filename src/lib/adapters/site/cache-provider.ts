import cloudflare from "@astrojs/cloudflare/cache/provider";
import type { CacheProviderFactory } from "astro";
import { collectInvalidationTags } from "astro/cache/provider-utils";
import { purgeTags } from "./purge";

/**
 * Astro's Cloudflare cache provider (headers and tags as it sets them), with a purge that
 * reports failure. Its own `invalidate` discards the result of `cache.purge`, so a purge that
 * Cloudflare refuses (rate-limited) went unnoticed; `purgeTags` logs it. EmDash calls this on
 * every publish, unpublish and edit (astro.config.mjs `cache.provider`).
 */
const provider: CacheProviderFactory = (config) => ({
	...cloudflare(config),
	async invalidate(options) {
		const { cache } = await import("cloudflare:workers");
		const purge = typeof cache.purge === "function" ? cache.purge.bind(cache) : undefined;
		await purgeTags(purge, collectInvalidationTags(options));
	},
});

export default provider;
