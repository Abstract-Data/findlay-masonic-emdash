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
			/** A non-production Worker refused to email an address off the allowlist. */
			readonly event: "email.blocked";
			readonly siteEnv: string;
			readonly recipients: number;
			readonly blocked: number;
	  }
	| {
			readonly event: "email.failed";
			readonly kind: "rejected" | "unavailable";
			readonly status: number | null;
			readonly error: string;
	  }
	| {
			/** The scheduler ran, but its Checkly heartbeat ping did not land. */
			readonly event: "heartbeat.failed";
			readonly status: number | null;
			readonly error: string;
	  };

export type LogRecord = Readonly<Record<string, string | number | boolean | null>>;

const UNAVAILABLE = new Set(["unavailable", "not-configured", "mail-unavailable"]);

function levelOf(entry: LogEvent): Level {
	switch (entry.event) {
		case "body_access.lookup_failed":
		case "email.failed":
			return "error";
		case "body_access.refused":
		case "form.rate_limited":
		case "email.blocked":
		case "heartbeat.failed":
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

/** An error's message, for a log field; `scrub` still runs on it. */
export function messageOf(error: unknown): string {
	return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
