import type { Mailer } from "@adapters/resend-mailer";
import type { EmailDeliverEvent } from "emdash";

export interface TransportDeps {
	readonly mailer: Mailer | null;
	readonly from: string | null;
}

/**
 * FR-8.1: EmDash's system email (invites, sign-in links, notifications) through Resend, keeping
 * `cc` and `replyTo`. A throw tells EmDash the email was not delivered.
 */
export function transport(deps: () => Promise<TransportDeps>) {
	return async (event: EmailDeliverEvent): Promise<void> => {
		const { mailer, from } = await deps();
		if (mailer === null || from === null) {
			throw new Error("Email is not configured: set RESEND_API_KEY and RESEND_FROM.");
		}
		const { message } = event;
		const sent = await mailer.sendEmail({
			from,
			to: [message.to],
			subject: message.subject,
			text: message.text,
			...(message.html === undefined ? {} : { html: message.html }),
			...(message.cc === undefined ? {} : { cc: message.cc }),
			...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
		});
		if (!sent.ok) throw new Error(`Resend did not accept the email: ${sent.error.message}`);
	};
}
