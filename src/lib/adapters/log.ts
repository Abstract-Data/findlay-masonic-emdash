/**
 * One JSON line per security- or delivery-relevant event, which Workers Logs indexes field by
 * field and exports to Axiom (docs/observability/axiom.md). An event's fields are primitives
 * named by its type, so no request body, email or message has a field to travel in, and every
 * string is scrubbed of email addresses and token-shaped runs before it leaves the Worker.
 */

export type Level = "info" | "warn" | "error";

export type LogEvent =
	| {
			/** A write the body-access guard refused, by the middleware or a hook. */
			readonly event: "body_access.refused";
			/** What the caller sees: BODY_ACCESS_DENIED, INVALID_SLUG or SAVE_REJECTED. */
			readonly code: "BODY_ACCESS_DENIED" | "INVALID_SLUG" | "SAVE_REJECTED";
			readonly source: "middleware" | "beforeSave" | "publish" | "unpublish" | "schedule";
			readonly user: string | null;
			readonly route?: string;
			readonly method?: string;
			readonly collection?: string;
			readonly reason: string;
	  }
	| {
			/** A read the guard needed failed, so it refused rather than guess. */
			readonly event: "body_access.lookup_failed";
			readonly route: string;
			readonly method: string;
			readonly user: string;
			readonly error: string;
	  }
	| {
			readonly event: "newsletter.test_sent";
			readonly issue: string;
			readonly revision: number;
			readonly recipients: number;
	  }
	| {
			readonly event: "newsletter.approved";
			readonly issue: string;
			readonly revision: number;
			readonly status: string;
			readonly broadcast: string | null;
			readonly scheduled: boolean;
	  }
	| {
			readonly event: "newsletter.refused";
			readonly action: "test-send" | "approve";
			readonly issue: string;
			readonly code: string;
	  }
	| {
			readonly event: "form.submitted";
			readonly form: "contact" | "subscribe";
			readonly outcome: string;
	  }
	| {
			readonly event: "form.rate_limited";
			readonly form: "contact" | "subscribe";
			/** Which count was full: one network's, or everyone's for the target. */
			readonly limit: "sender" | "target";
	  }
	| {
			/** Deleting a form's past-window rate-limit counters failed; the next window retries. */
			readonly event: "form.sweep_failed";
			readonly namespace: string;
			readonly error: string;
	  }
	| {
			/** A non-production Worker refused an email, signup or Broadcast off the allowlist. */
			readonly event: "email.blocked";
			readonly siteEnv: string;
			readonly action: "email" | "signup" | "broadcast";
			readonly recipients: number;
			readonly blocked: number;
	  }
	| {
			readonly event: "email.failed";
			readonly kind: "rejected" | "unavailable" | "blocked";
			readonly status: number | null;
			readonly error: string;
	  }
	| {
			/** The scheduler ran, but its Checkly heartbeat ping did not land. */
			readonly event: "heartbeat.failed";
			readonly status: number | null;
			readonly error: string;
	  }
	| {
			/** EmDash's scheduled run threw, so this cron run sent no heartbeat. */
			readonly event: "scheduler.failed";
			readonly error: string;
	  }
	| {
			/** Entries past their scheduled time are still unpublished, so no heartbeat went. */
			readonly event: "scheduler.overdue";
			/** How many, up to 100 a collection. */
			readonly entries: number;
			readonly collections: number;
	  }
	| {
			/** The overdue check could not run, so no heartbeat went. */
			readonly event: "scheduler.check_failed";
			readonly error: string;
	  }
	| {
			/** Edge copies were not purged; they live until their max-age. */
			readonly event: "cache.purge_failed";
			readonly tags: number;
			readonly error: string;
	  };

export type LogRecord = Readonly<Record<string, string | number | boolean | null>>;

const UNAVAILABLE = new Set(["unavailable", "not-configured", "mail-unavailable"]);

function levelOf(entry: LogEvent): Level {
	switch (entry.event) {
		case "body_access.lookup_failed":
		case "email.failed":
		case "scheduler.failed":
		case "scheduler.overdue":
		case "scheduler.check_failed":
			return "error";
		case "body_access.refused":
		case "form.rate_limited":
		case "form.sweep_failed":
		case "email.blocked":
		case "heartbeat.failed":
		case "cache.purge_failed":
			return "warn";
		case "newsletter.refused":
			return UNAVAILABLE.has(entry.code) ? "error" : "warn";
		case "form.submitted":
			if (UNAVAILABLE.has(entry.outcome)) return "error";
			return entry.outcome === "sent" || entry.outcome === "ok" ? "info" : "warn";
		case "newsletter.test_sent":
		case "newsletter.approved":
			break;
	}
	return "info";
}

const MAX_STRING = 500;
const EMAIL = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+/g;
// Resend keys (re_...), Turnstile secrets (0x...), bearer and session tokens are long unbroken
// runs; 26-character entry ULIDs and the dash-separated groups of issue UUIDs stay readable.
const TOKEN = /[\w+/=]{32,}/g;

/** A string without email addresses or token-shaped runs, and bounded in length. */
export function scrub(value: string): string {
	const clean = value.replaceAll(EMAIL, "[email]").replaceAll(TOKEN, "[redacted]");
	return clean.length <= MAX_STRING ? clean : `${clean.slice(0, MAX_STRING - 1)}…`;
}

/** The line an event becomes: its level, its fields with strings scrubbed, and nothing else. */
export function record(entry: LogEvent): LogRecord {
	const fields: [string, string | number | boolean | null][] = [["level", levelOf(entry)]];
	for (const pair of Object.entries(entry)) {
		const key = pair[0];
		const value: unknown = pair[1];
		if (typeof value === "string") fields.push([key, scrub(value)]);
		else if (typeof value === "number" || typeof value === "boolean" || value === null) {
			fields.push([key, value]);
		}
	}
	return Object.fromEntries(fields);
}

export function log(entry: LogEvent): void {
	const line = JSON.stringify(record(entry));
	switch (levelOf(entry)) {
		case "info":
			console.info(line);
			return;
		case "warn":
			console.warn(line);
			return;
		case "error":
			console.error(line);
	}
}

const LEVELS = ["debug", "log", "info", "warn", "error"] as const;

function withoutEmails(argument: unknown): unknown {
	if (typeof argument === "string") return argument.replaceAll(EMAIL, "[email]");
	if (!(argument instanceof Error)) return argument;
	const copy = new Error(argument.message.replaceAll(EMAIL, "[email]"));
	copy.name = argument.name;
	copy.stack = argument.stack?.replaceAll(EMAIL, "[email]");
	return copy;
}

/**
 * Everything the Worker writes to the console reaches Workers Logs and Axiom, EmDash's own lines
 * included, and some of those quote an address: a failed delivery names its recipient (a body's
 * private contact recipient or an invitee), a sign-in names the user. This wraps each console
 * method so every string and error argument has its addresses replaced by `[email]`; other
 * objects pass as they are. Installed once, at the Worker's entry (src/worker.ts).
 */
export function redactConsoleEmails(target: Console): void {
	for (const level of LEVELS) {
		const write = target[level].bind(target);
		target[level] = (...args: unknown[]) => write(...args.map(withoutEmails));
	}
}

/** An error's message, for a log field; `scrub` still runs on it. */
export function messageOf(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
