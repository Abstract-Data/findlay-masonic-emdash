import { log, messageOf } from "./log";

/**
 * After a scheduled run that succeeded, ping the Checkly heartbeat (checkly/scheduler.check.ts)
 * once an hour, at the run whose scheduled time is the top of the hour. A missing or malformed
 * URL pings nothing; a failed ping is logged and never fails the scheduled run.
 */
export async function pingHeartbeat(
	url: unknown,
	scheduledTime: number,
	send: (url: string) => Promise<Response>,
): Promise<"pinged" | "skipped" | "failed"> {
	if (new Date(scheduledTime).getUTCMinutes() !== 0) return "skipped";
	if (typeof url !== "string" || !URL.canParse(url) || new URL(url).protocol !== "https:") {
		return "skipped";
	}
	try {
		const response = await send(url);
		if (response.ok) return "pinged";
		log({ event: "heartbeat.failed", status: response.status, error: "not ok" });
	} catch (error) {
		// The URL is the heartbeat's credential, and a fetch error can quote it.
		log({
			event: "heartbeat.failed",
			status: null,
			error: messageOf(error).replaceAll(url, "[heartbeat URL]"),
		});
	}
	return "failed";
}
