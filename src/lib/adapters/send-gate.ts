import { parseAddress } from "@core/address";
import { err, type Result } from "@core/ids";
import type { Mailer, MailerError, OutgoingEmail } from "./resend-mailer";

/**
 * Which Worker this is, from `SITE_ENV`. Only the exact value "production" is production, so an
 * unset, misspelt or unknown value fails closed into the non-production rules.
 */
export type SiteEnv = "production" | "non-production";

export function parseSiteEnv(raw: string | undefined): SiteEnv {
	return raw?.trim() === "production" ? "production" : "non-production";
}

// Resend's test inboxes (delivered@, bounced@, complained@resend.dev, with optional +labels)
// accept mail without reaching a person.
const RESEND_TEST = /@resend\.dev$/i;

/**
 * The recipients of an email that a non-production Worker may not reach. A recipient that is not
 * exactly one address ("a@x.com,b@resend.dev", a display name) counts as off the list.
 */
export function offAllowlist(email: OutgoingEmail, allowlist: readonly string[]): string[] {
	const reachable = reachableBy(allowlist);
	return [...email.to, ...(email.cc ?? [])].filter((address) => !reachable(address));
}

function reachableBy(allowlist: readonly string[]): (raw: string) => boolean {
	const allowed = new Set(allowlist.map((address) => address.toLowerCase()));
	return (raw) => {
		const address = parseAddress(raw);
		return address !== null && (allowed.has(address.toLowerCase()) || RESEND_TEST.test(address));
	};
}

/** What a non-production Worker refused: one email, one signup or one Broadcast. */
export interface Blocked {
	readonly action: "email" | "signup" | "broadcast";
	/** Addresses the request would have reached. */
	readonly recipients: number;
	/** How many of them are off the allowlist. */
	readonly blocked: number;
}

const NOT_PRODUCTION = "This is not the production site, so";

/**
 * Constitution § Newsletter and email: outside production, nothing reaches an address beyond
 * the allowlisted inboxes and Resend's test addresses. Every path to a person goes through the
 * mailer, so the gate wraps all of it: a single email with any recipient off the list is refused
 * whole, never trimmed; a signup is refused for an address off the list, so a stranger never
 * joins the Segment; and a Broadcast is created or sent only when every contact in its Segment
 * is on the list, read from Resend at that moment. A Segment that cannot be read refuses.
 */
export function gateOutbound(
	mailer: Mailer,
	options: {
		readonly env: SiteEnv;
		readonly allowlist: readonly string[];
		readonly onBlocked?: (blocked: Blocked) => void;
	},
): Mailer {
	if (options.env === "production") return mailer;
	const reachable = reachableBy(options.allowlist);
	const refuse = (blocked: Blocked, message: string): Result<never, MailerError> => {
		options.onBlocked?.(blocked);
		return err({ kind: "blocked", status: null, message: `${NOT_PRODUCTION} ${message}` });
	};

	async function toAllowlistedSegment<T>(
		segmentId: string | null | undefined,
		send: () => Promise<Result<T, MailerError>>,
	): Promise<Result<T, MailerError>> {
		// Resend's SDK lists every contact in the account when it is given no Segment id.
		if (segmentId === null || segmentId === undefined || segmentId === "") {
			return refuse(
				{ action: "broadcast", recipients: 0, blocked: 0 },
				"a Broadcast must go to a Segment it can check.",
			);
		}
		const contacts = await mailer.segmentContacts(segmentId);
		if (!contacts.ok) return contacts;
		const blocked = contacts.value.filter((address) => !reachable(address)).length;
		if (blocked === 0) return send();
		return refuse(
			{ action: "broadcast", recipients: contacts.value.length, blocked },
			`a Broadcast goes only to a Segment of NEWSLETTER_TEST_ALLOWLIST and Resend test addresses; ${blocked} contact(s) in the Segment are not on it.`,
		);
	}

	return {
		...mailer,
		async sendEmail(email) {
			const recipients = email.to.length + (email.cc?.length ?? 0);
			const blocked = offAllowlist(email, options.allowlist).length;
			if (blocked === 0) return mailer.sendEmail(email);
			return refuse(
				{ action: "email", recipients, blocked },
				`email goes only to NEWSLETTER_TEST_ALLOWLIST and Resend test addresses; ${blocked} recipient(s) were not on it.`,
			);
		},
		async upsertContact(signup) {
			if (reachable(signup.email)) return mailer.upsertContact(signup);
			return refuse(
				{ action: "signup", recipients: 1, blocked: 1 },
				"it signs up only NEWSLETTER_TEST_ALLOWLIST and Resend test addresses.",
			);
		},
		createBroadcast: async (draft) =>
			toAllowlistedSegment(draft.segmentId, async () => mailer.createBroadcast(draft)),
		async sendBroadcast(id, scheduledAt) {
			const segment = await mailer.broadcastSegment(id);
			if (!segment.ok) return segment;
			return toAllowlistedSegment(segment.value, async () => mailer.sendBroadcast(id, scheduledAt));
		},
	};
}
