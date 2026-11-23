import { TURNSTILE_FIELD, type TurnstileVerifier } from "@adapters/turnstile";
import { z } from "astro/zod";
import type { EmailMessage } from "emdash";
import type { SubscribeRequest } from "./subscribe";

export type ContactOutcome =
	| "sent"
	| "invalid"
	| "verification-failed"
	| "rate-limited"
	| "unavailable";

/** The published body a message is for. Its recipients never leave the server (spec Q12). */
export interface ContactBody {
	readonly name: string;
	readonly recipients: readonly string[];
}

export interface RateLimiter {
	/** Counts a message from `sender` (a client IP, or null) to `body`; false once over the limit. */
	allow(sender: string | null, body: string): Promise<boolean>;
}

export interface ContactDeps {
	readonly verifier: TurnstileVerifier | null;
	/** EmDash's email pipeline, delivered by the `email:deliver` transport; null when none is set. */
	readonly send: ((message: EmailMessage) => Promise<void>) | null;
	readonly body: (id: string) => Promise<ContactBody | null>;
	readonly limiter: RateLimiter;
	readonly siteName: string;
}

const contactSchema = z.object({
	body: z.string().min(1).max(64),
	name: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.regex(/^[^\p{Cc}]*$/u),
	email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
	message: z.string().trim().min(1).max(5000),
});

export type ContactInput = z.infer<typeof contactSchema>;

export function parseContact(fields: SubscribeRequest["fields"]): ContactInput | null {
	const field = (name: string) => fields.find((f) => f.name === name)?.value ?? "";
	const parsed = contactSchema.safeParse({
		body: field("body"),
		name: field("name"),
		email: field("email"),
		message: field("message"),
	});
	return parsed.success ? parsed.data : null;
}

/** The email the body's recipients get; replying answers the visitor. */
export function contactEmail(input: ContactInput, body: ContactBody, siteName: string) {
	const [to = "", ...cc] = body.recipients;
	return {
		to,
		...(cc.length === 0 ? {} : { cc }),
		replyTo: input.email,
		subject: `Website message for ${body.name} from ${input.name}`,
		text: [
			`${input.name} <${input.email}> sent this message to ${body.name} through the contact form on the ${siteName} website.`,
			"",
			input.message,
			"",
			`Reply to this email to answer ${input.name}.`,
		].join("\n"),
	} satisfies EmailMessage;
}

/**
 * Spec Q12: a visitor writes to one body. The form is validated, the Turnstile token verified
 * and the body looked up; then each sender may send a body only so many messages an hour, which
 * protects that body's inbox, and the email goes to the body's private recipients. Counting only
 * after the lookup keeps made-up body ids out of the counter store.
 */
export async function contact(
	deps: ContactDeps,
	request: Pick<SubscribeRequest, "fields" | "remoteIp">,
): Promise<ContactOutcome> {
	const input = parseContact(request.fields);
	if (input === null) return "invalid";
	const { verifier, send } = deps;
	if (verifier === null || send === null) return "unavailable";
	const token = request.fields.find((field) => field.name === TURNSTILE_FIELD)?.value ?? null;
	const verdict = await verifier.verify(token, request.remoteIp);
	if (!verdict.ok) return verdict.reason === "unavailable" ? "unavailable" : "verification-failed";
	const body = await deps.body(input.body);
	if (body === null) return "invalid";
	if (body.recipients.length === 0) return "unavailable";
	if (!(await deps.limiter.allow(request.remoteIp, input.body))) return "rate-limited";
	try {
		await send(contactEmail(input, body, deps.siteName));
	} catch {
		return "unavailable";
	}
	return "sent";
}

/** The slice of a plugin's KV store the limiter uses. */
export interface CounterStore {
	getVersioned(key: string): Promise<{ value: unknown; revision: string } | null>;
	compareAndSet(
		key: string,
		expectedRevision: string | null,
		value: unknown,
	): Promise<{ applied: boolean }>;
}

interface Window {
	readonly start: number;
	readonly count: number;
}

export const CONTACT_LIMIT = { messages: 5, windowSeconds: 60 * 60 } as const;
const ATTEMPTS = 3;

/**
 * A fixed-window count per sender and body in plugin KV, keyed by a SHA-256 of the two rather
 * than the address itself. Requests with no trusted IP share one sender. Writes are
 * compare-and-set; a key that stays contended counts as over the limit.
 */
export function kvRateLimiter(
	store: CounterStore,
	now: () => number,
	limit: { readonly messages: number; readonly windowSeconds: number } = CONTACT_LIMIT,
): RateLimiter {
	return {
		async allow(sender, body) {
			const key = `contact-rate:${await sha256(JSON.stringify([sender ?? "unknown", body]))}`;
			const start = Math.floor(now() / 1000 / limit.windowSeconds) * limit.windowSeconds;
			for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
				// oxlint-disable-next-line no-await-in-loop -- each retry follows a lost compare-and-set.
				const current = await store.getVersioned(key);
				const count = (current === null ? null : countIn(current.value, start)) ?? 0;
				if (count >= limit.messages) return false;
				// oxlint-disable-next-line no-await-in-loop -- see above.
				const written = await store.compareAndSet(key, current?.revision ?? null, {
					start,
					count: count + 1,
				} satisfies Window);
				if (written.applied) return true;
			}
			return false;
		},
	};
}

/** The stored count when it belongs to this window; an older window or other value counts 0. */
function countIn(value: unknown, start: number): number | null {
	if (typeof value !== "object" || value === null) return null;
	const stored: unknown = Reflect.get(value, "start");
	const count: unknown = Reflect.get(value, "count");
	return stored === start && typeof count === "number" ? count : null;
}

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
