import { HeartbeatMonitor } from "checkly/constructs";

// The Worker's cron runs EmDash's scheduled work every minute: scheduled publishes and the
// scheduled-publish rejections the newsletter and body-access hooks raise. After a run that
// succeeds at the top of each hour, src/worker.ts pings this monitor's URL (the Worker secret
// CHECKLY_HEARTBEAT_URL). No ping for an hour and ten minutes means scheduling has stopped.
export const scheduledWork = new HeartbeatMonitor("scheduled-work-heartbeat", {
	name: "Scheduled publishing (Worker cron)",
	period: 1,
	periodUnit: "hours",
	grace: 10,
	graceUnit: "minutes",
	tags: ["findlay-masonic", "scheduler"],
});
