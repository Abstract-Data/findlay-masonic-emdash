import { TURNSTILE_FIELD, type TurnstileVerifier } from "@adapters/turnstile";
import { z } from "astro/zod";
import type { EmailMessage } from "emdash";
import type { FormLimit, RateLimiter } from "./rate-limit";
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

/** Five messages an hour from one network to one body, and thirty to one body from everyone. */
export const CONTACT_LIMIT: FormLimit = {
	namespace: "contact-rate",
	perSender: 5,
	perTarget: 30,
	windowSeconds: 60 * 60,
};

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
		.regex(/^[^\p{Cc}]*$/u)
		.transform(plainName)
		.pipe(z.string().min(1).max(100)),
	email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
	message: z.string().trim().min(1).max(5000),
});

export type ContactInput = z.infer<typeof contactSchema>;

// Angle brackets let a name pose as an address ("Grand Master <gm@example.org>"); format
// characters (bidi overrides such as U+202E) and line or paragraph separators (U+2028, U+2029)
// can reorder or split the lines a recipient reads. A separator becomes a space; the rest go.
const UNSAFE_IN_NAME = /[<>\p{Cf}]/gu;
const SEPARATOR = /[\p{Zl}\p{Zp}\s]+/gu;

/** The visitor's name without anything that could pose as an address or rearrange the email. */
export function plainName(raw: string): string {
	return raw.replaceAll(UNSAFE_IN_NAME, "").replaceAll(SEPARATOR, " ").trim();
}

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
		subject: `Website message for ${body.name}`,
		text: [
			`A visitor wrote to ${body.name} through the contact form on the ${siteName} website.`,
			"",
			`Name, as the visitor typed it: "${input.name}"`,
			`Email address: ${input.email}`,
			"",
			input.message,
			"",
			"Reply to this email to answer the visitor.",
		].join("\n"),
	} satisfies EmailMessage;
}

/**
 * Spec Q12: a visitor writes to one body. The form is validated, the Turnstile token verified
 * and the body looked up; then one network may send a body only so many messages an hour, and
 * everyone together only so many more, which protects that body's inbox; and the email goes to
 * the body's private recipients. Counting only after the lookup keeps made-up body ids out of the
 * counter store.
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
	if (!(await deps.limiter.allow(request.remoteIp, input.body)).ok) return "rate-limited";
	try {
		await send(contactEmail(input, body, deps.siteName));
	} catch {
		return "unavailable";
	}
	return "sent";
}
