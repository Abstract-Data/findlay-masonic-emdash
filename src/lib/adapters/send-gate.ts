import { err } from "@core/ids";
import type { Mailer, OutgoingEmail } from "./resend-mailer";

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

/** The recipients of an email that a non-production Worker may not reach. */
export function offAllowlist(email: OutgoingEmail, allowlist: readonly string[]): string[] {
	const allowed = new Set(allowlist.map((address) => address.toLowerCase()));
	return [...email.to, ...(email.cc ?? [])].filter(
		(address) => !allowed.has(address.trim().toLowerCase()) && !RESEND_TEST.test(address.trim()),
	);
}

/**
 * Constitution § Newsletter and email: outside production, email goes only to the allowlisted
 * inboxes and Resend's test addresses. Every single email the plugin sends (EmDash's
 * `email:deliver` for invites, sign-in links and contact messages, and newsletter test sends)
 * goes through `sendEmail`, so the gate sits there. An email with any recipient off the list is
 * refused whole, never trimmed, so nobody gets a message meant for a group they are not in.
 * Broadcasts go to a Segment, not to addresses; staging's Segment holds only allowlisted
 * addresses (docs/runbooks/newsletter-send.md).
 */
export function gateOutbound(
	mailer: Mailer,
	options: {
		readonly env: SiteEnv;
		readonly allowlist: readonly string[];
		readonly onBlocked?: (email: OutgoingEmail, blocked: number) => void;
	},
): Mailer {
	if (options.env === "production") return mailer;
	return {
		...mailer,
		async sendEmail(email) {
			const blocked = offAllowlist(email, options.allowlist).length;
			if (blocked === 0) return mailer.sendEmail(email);
			options.onBlocked?.(email, blocked);
			return err({
				kind: "rejected",
				status: null,
				message: `This is not the production site, so email goes only to NEWSLETTER_TEST_ALLOWLIST and Resend test addresses; ${blocked} recipient(s) were not on it.`,
			});
		},
	};
}
