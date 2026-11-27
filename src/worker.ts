import handler, { EmDashRoom, EmDashRoomSite, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { nothingOverdue } from "@adapters/emdash/overdue";
import { pingHeartbeat } from "@adapters/heartbeat";
import { log, messageOf, redactConsoleEmails } from "@adapters/log";
import { forSharedCache } from "@adapters/site/cache";
import cacheProvider from "@adapters/site/cache-provider";
import { runScheduledTasks } from "emdash/middleware";

export { EmDashRoom, EmDashRoomSite, PluginBridge };

redactConsoleEmails(console);

/** As EmDash's own scheduled handler: wait for content due within the next run's start. */
const PUBLISH_UPCOMING_WITHIN_MS = 70_000;

/** The provider a request purges through on publish, for the purges of a scheduled publish. */
const routeCache = cacheProvider(undefined);

export default {
	...handler,
	async fetch(request, env, ctx) {
		return forSharedCache(request, await handler.fetch(request, env, ctx));
	},
	/**
	 * The heartbeat means "nothing is overdue". EmDash's createScheduledHandler queues the run in
	 * waitUntil and swallows its failure, and the run itself catches a failed publish sweep and
	 * returns normally, so neither its start nor its return proves the publishing happened. Here
	 * the run is awaited, then the ping goes only if no collection still holds an entry the run
	 * had to publish: one due by its end, or by the end of its publish window if it ran longer
	 * (docs/runbooks/incident.md).
	 */
	async scheduled(controller, env) {
		const started = Date.now();
		try {
			await runScheduledTasks({
				onPublished: async (refs) =>
					routeCache.invalidate({ tags: [...new Set(refs.flatMap((r) => [r.collection, r.id]))] }),
				invalidateContentCache: async (tags) => routeCache.invalidate({ tags }),
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
			async () =>
				nothingOverdue(new Date(Math.min(Date.now(), started + PUBLISH_UPCOMING_WITHIN_MS))),
		);
	},
} satisfies ExportedHandler<Env>;
