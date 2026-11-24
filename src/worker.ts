import handler, { EmDashRoom, EmDashRoomSite, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { pingHeartbeat } from "@adapters/heartbeat";
import { log, messageOf, redactConsoleEmails } from "@adapters/log";
import { forSharedCache } from "@adapters/site/cache";
import { purgeTags } from "@adapters/site/purge";
import { cache } from "cloudflare:workers";
import { runScheduledTasks } from "emdash/middleware";

export { EmDashRoom, EmDashRoomSite, PluginBridge };

redactConsoleEmails(console);

/** As EmDash's own scheduled handler: wait for content due within the next run's start. */
const PUBLISH_UPCOMING_WITHIN_MS = 70_000;

// `cache` is the request's or cron run's Workers cache; outside Cloudflare it has no purge.
const purge = async (tags: readonly string[]) =>
	purgeTags(
		typeof cache.purge === "function" ? async (options) => cache.purge(options) : undefined,
		tags,
	);

export default {
	...handler,
	async fetch(request, env, ctx) {
		return forSharedCache(request, await handler.fetch(request, env, ctx));
	},
	/**
	 * EmDash's createScheduledHandler queues the run in waitUntil and swallows its failure, so a
	 * ping after it proved nothing. Here the run is awaited, and the heartbeat goes only after
	 * it returned: the cron fired, EmDash started against D1 and finished its maintenance pass.
	 * A step EmDash treats as non-fatal (one collection's publish sweep, cleanup) logs its own
	 * `[scheduled-publish]` error and does not stop the ping (docs/observability/axiom.md).
	 */
	async scheduled(controller, env) {
		try {
			await runScheduledTasks({
				onPublished: async (refs) => purge([...new Set(refs.flatMap((r) => [r.collection, r.id]))]),
				invalidateContentCache: purge,
				publishUpcomingWithinMs: PUBLISH_UPCOMING_WITHIN_MS,
			});
		} catch (error) {
			log({ event: "scheduler.failed", error: messageOf(error) });
			throw error;
		}
		await pingHeartbeat(
			Reflect.get(env, "CHECKLY_HEARTBEAT_URL"),
			controller.scheduledTime,
			async (url) => fetch(url),
		);
	},
} satisfies ExportedHandler<Env>;
