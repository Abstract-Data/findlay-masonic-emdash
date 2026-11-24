import { ContentRepository } from "emdash";
import { withEmDashRuntime } from "emdash/middleware";
import { log, messageOf } from "../log";

// EmDash publishes at most 100 entries of a collection per run, so a count stops there too.
const COUNT_LIMIT = 100;

/**
 * Whether every collection has published what fell due by `cutoff`, by the test EmDash's own
 * sweep uses (`findReadyToPublish`): a `scheduled_at` at or before the time on an entry not in
 * the trash. False when anything is overdue (`scheduler.overdue`, counts only) and when the
 * check could not run (`scheduler.check_failed`), so the heartbeat fails closed.
 */
export async function nothingOverdue(cutoff: Date): Promise<boolean> {
	try {
		const counts = await withEmDashRuntime(async (runtime) => {
			const repo = new ContentRepository(runtime.db);
			const collections = await runtime.schemaRegistry.listCollections();
			return Promise.all(
				collections.map(
					async ({ slug }) => (await repo.findReadyToPublish(slug, COUNT_LIMIT, cutoff)).length,
				),
			);
		});
		const waiting = counts.filter((count) => count > 0);
		if (waiting.length === 0) return true;
		const entries = waiting.reduce((sum, count) => sum + count, 0);
		log({ event: "scheduler.overdue", entries, collections: waiting.length });
	} catch (error) {
		log({ event: "scheduler.check_failed", error: messageOf(error) });
	}
	return false;
}
