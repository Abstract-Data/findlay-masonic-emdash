import type { ContactSignup, Mailer } from "@adapters/resend-mailer";
import {
	hostnamesOf,
	TURNSTILE_ACTION,
	TURNSTILE_FIELD,
	type TurnstileVerifier,
} from "@adapters/turnstile";
import { z } from "astro/zod";
import type { FormLimit, RateLimiter } from "./rate-limit";

/** Where the signup form posts back to, with `?subscribe=<outcome>` added. */
export const SIGNUP_PAGE = "/newsletters";

/** Five signups an hour from one network, and sixty an hour from everyone. */
export const SUBSCRIBE_LIMIT: FormLimit = {
	namespace: "subscribe-rate",
	perSender: 5,
	perTarget: 60,
	windowSeconds: 60 * 60,
};

/** The one target every signup counts against. */
export const SIGNUP_TARGET = "newsletter";

/** `test-site`: a non-production Worker takes signups only from its allowlisted inboxes. */
export type SubscribeOutcome =
	| "ok"
	| "previously-unsubscribed"
	| "invalid"
	| "verification-failed"
	| "rate-limited"
	| "test-site"
	| "unavailable";

export interface SubscribeRequest {
	readonly origin: string | null;
	readonly csrfHeader: string | null;
	/** The request's own origin and the configured site origin. */
	readonly siteOrigins: readonly string[];
	readonly fields: readonly { readonly name: string; readonly value: string }[];
	readonly remoteIp: string | null;
}

export interface SubscribeDeps {
	readonly mailer: Mailer | null;
	readonly verifier: TurnstileVerifier | null;
	readonly segmentId: string | null;
	readonly newsletterTopicId: string | null;
	/** Body id to its Resend Topic, from `bodies.resend_topic_id`; null when unset. */
	readonly bodyTopics: ReadonlyMap<string, string | null>;
	readonly limiter: RateLimiter;
}

/**
 * FR-7.2: a browser posting from another site sends its own Origin and cannot add the custom
 * header, so a request passes only with the site's Origin or `X-EmDash-Request: 1`.
 */
export function sameSite(request: Pick<SubscribeRequest, "origin" | "csrfHeader" | "siteOrigins">) {
	if (request.csrfHeader === "1") return true;
	return request.origin !== null && request.siteOrigins.includes(request.origin);
}

const MAX_BODIES = 20;

const signupSchema = z.object({
	email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
	bodies: z.array(z.string().max(64)).max(MAX_BODIES),
});

export type Signup = z.infer<typeof signupSchema>;

/** The form's fields as a signup: one `email`, and a `body` field per ticked body. */
export function parseSignup(fields: SubscribeRequest["fields"]): Signup | null {
	const parsed = signupSchema.safeParse({
		email: fields.find((field) => field.name === "email")?.value ?? "",
		bodies: [...new Set(fields.filter((field) => field.name === "body").map((f) => f.value))],
	});
	return parsed.success ? parsed.data : null;
}

/**
 * FR-7.1: validate, verify the Turnstile token, count the signup against the rate limits (one
 * network, then everyone, as the contact form does), then create or update the Resend contact in the
 * subscribers Segment with the newsletter Topic and each chosen body's Topic. Bodies without a
 * Topic are skipped; an unknown body makes the request invalid. An existing contact keeps every
 * opt-out it made (resend-mailer.ts `upsertContact`).
 */
export async function subscribe(
	deps: SubscribeDeps,
	request: SubscribeRequest,
): Promise<SubscribeOutcome> {
	const signup = parseSignup(request.fields);
	if (signup === null || signup.bodies.some((body) => !deps.bodyTopics.has(body))) {
		return "invalid";
	}
	const { mailer, verifier, segmentId, newsletterTopicId } = deps;
	if (mailer === null || verifier === null || segmentId === null || newsletterTopicId === null) {
		return "unavailable";
	}
	const token = request.fields.find((field) => field.name === TURNSTILE_FIELD)?.value ?? null;
	const verdict = await verifier.verify(token, request.remoteIp, {
		hostnames: hostnamesOf(request.siteOrigins),
		action: TURNSTILE_ACTION.subscribe,
	});
	if (!verdict.ok) return verdict.reason === "unavailable" ? "unavailable" : "verification-failed";
	if (!(await deps.limiter.allow(request.remoteIp, SIGNUP_TARGET)).ok) return "rate-limited";
	const contact: ContactSignup = {
		email: signup.email,
		segmentId,
		newsletterTopicId,
		bodyTopicIds: signup.bodies.flatMap((body) => deps.bodyTopics.get(body) ?? []),
	};
	const saved = await mailer.upsertContact(contact);
	if (!saved.ok) return saved.error.kind === "blocked" ? "test-site" : "unavailable";
	return saved.value === "subscribed" ? "ok" : "previously-unsubscribed";
}
