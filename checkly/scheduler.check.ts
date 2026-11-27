import { HeartbeatMonitor } from "checkly/constructs";

// The Worker's cron runs EmDash's scheduled work every minute: scheduled publishes, the
// scheduled-publish rejections the newsletter and body-access hooks raise, plugin cron and
// cleanup. src/worker.ts awaits that run and, on the run scheduled at the top of each hour,
// pings this monitor's URL (the Worker secret CHECKLY_HEARTBEAT_URL) only if the run returned
// and no collection still holds an entry it had to publish. No ping for an hour and ten minutes
// means the cron stopped, the run throws (`scheduler.failed` in Axiom), scheduled content is
// overdue (`scheduler.overdue`) or the check could not run (`scheduler.check_failed`).
// docs/runbooks/incident.md lists the overdue entries.
export const scheduledWork = new HeartbeatMonitor("scheduled-work-heartbeat", {
	name: "Scheduled publishing (Worker cron)",
	period: 1,
	periodUnit: "hours",
	grace: 10,
	graceUnit: "minutes",
	tags: ["findlay-masonic", "scheduler"],
});
