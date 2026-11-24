import { HeartbeatMonitor } from "checkly/constructs";

// The Worker's cron runs EmDash's scheduled work every minute: scheduled publishes, the
// scheduled-publish rejections the newsletter and body-access hooks raise, plugin cron and
// cleanup. src/worker.ts awaits that run and, on the run scheduled at the top of each hour,
// pings this monitor's URL (the Worker secret CHECKLY_HEARTBEAT_URL) only if the run returned:
// the cron fired, EmDash started against D1 and finished its pass. No ping for an hour and ten
// minutes means the cron stopped or the run throws (`scheduler.failed` in Axiom). EmDash treats
// one collection's failed publish sweep as non-fatal: it logs `[scheduled-publish]` and the ping
// still goes, so the Axiom alert on those lines covers it (docs/observability/axiom.md).
export const scheduledWork = new HeartbeatMonitor("scheduled-work-heartbeat", {
	name: "Scheduled publishing (Worker cron)",
	period: 1,
	periodUnit: "hours",
	grace: 10,
	graceUnit: "minutes",
	tags: ["findlay-masonic", "scheduler"],
});
