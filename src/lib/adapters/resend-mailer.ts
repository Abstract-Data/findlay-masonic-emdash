import { err, ok, type Result } from "@core/ids";
import { Resend, type ErrorResponse } from "resend";

/**
 * `rejected`: Resend refused the request and a retry would be refused again. `unavailable`:
 * the outcome is unknown (network, rate limit, 5xx), so the request may have taken effect.
 */
export interface MailerError {
	readonly kind: "rejected" | "unavailable";
	readonly status: number | null;
	readonly message: string;
}

export interface OutgoingEmail {
	readonly from: string;
	readonly to: readonly string[];
	readonly cc?: readonly string[];
	readonly replyTo?: string;
	readonly subject: string;
	readonly html?: string;
	readonly text: string;
}

export interface BroadcastDraft {
	/** The idempotency key: a retry looks the broadcast up by this name (FR-6.7). */
	readonly name: string;
	readonly segmentId: string;
	readonly topicId: string;
	readonly from: string;
	readonly subject: string;
	readonly previewText: string;
	readonly html: string;
	readonly text: string;
	/** ISO instant, or null to send now. */
	readonly scheduledAt: string | null;
}

export interface FoundBroadcast {
	readonly id: string;
	readonly status: "draft" | "queued" | "sent";
}

export interface ContactSignup {
	readonly email: string;
	readonly segmentId: string;
	/** Topics to opt in to. Topics not listed keep the contact's current choice. */
	readonly topicIds: readonly string[];
}

/** The port the newsletter plugin sends through. Only plugin routes and the transport use it. */
export interface Mailer {
	sendEmail(email: OutgoingEmail): Promise<Result<{ id: string }, MailerError>>;
	findBroadcast(name: string): Promise<Result<FoundBroadcast | null, MailerError>>;
	createBroadcast(draft: BroadcastDraft): Promise<Result<{ id: string }, MailerError>>;
	sendBroadcast(
		id: string,
		scheduledAt: string | null,
	): Promise<Result<{ id: string }, MailerError>>;
	upsertContact(signup: ContactSignup): Promise<Result<void, MailerError>>;
}

type SdkResponse<T> =
	| { readonly data: T; readonly error: null }
	| { readonly data: null; readonly error: ErrorResponse };

function mailerError(error: ErrorResponse): MailerError {
	const status = error.statusCode;
	const unknownOutcome = status === null || status === 429 || status >= 500;
	return { kind: unknownOutcome ? "unavailable" : "rejected", status, message: error.message };
}

function settle<T>(response: SdkResponse<T>): Result<T, MailerError> {
	return response.error === null ? ok(response.data) : err(mailerError(response.error));
}

const LIST_PAGE = 100;
/** Broadcasts are listed newest first; a retry looks for a key minted moments before. */
const LIST_PAGES = 5;

export function resendMailer(apiKey: string): Mailer {
	const resend = new Resend(apiKey);

	async function findBroadcast(
		name: string,
		after?: string,
		page = 1,
	): Promise<Result<FoundBroadcast | null, MailerError>> {
		const listed = settle(
			await resend.broadcasts.list(
				after === undefined ? { limit: LIST_PAGE } : { limit: LIST_PAGE, after },
			),
		);
		if (!listed.ok) return listed;
		const found = listed.value.data.find((broadcast) => broadcast.name === name);
		if (found !== undefined) return ok({ id: found.id, status: found.status });
		const last = listed.value.data.at(-1);
		if (!listed.value.has_more || last === undefined || page >= LIST_PAGES) return ok(null);
		return findBroadcast(name, last.id, page + 1);
	}

	return {
		async sendEmail(email) {
			const sent = await resend.emails.send({
				from: email.from,
				to: [...email.to],
				subject: email.subject,
				text: email.text,
				...(email.html === undefined ? {} : { html: email.html }),
				...(email.cc === undefined || email.cc.length === 0 ? {} : { cc: [...email.cc] }),
				...(email.replyTo === undefined ? {} : { replyTo: email.replyTo }),
			});
			return settle(sent);
		},

		findBroadcast: async (name) => findBroadcast(name),

		async createBroadcast(draft) {
			const common = {
				name: draft.name,
				segmentId: draft.segmentId,
				topicId: draft.topicId,
				from: draft.from,
				subject: draft.subject,
				previewText: draft.previewText,
				html: draft.html,
				text: draft.text,
			};
			// R3: broadcasts.create takes no idempotencyKey option. The header is sent anyway in
			// case the endpoint honours it; the key-named lookup is what makes a retry safe.
			const created = await resend.broadcasts.create(
				draft.scheduledAt === null
					? { ...common, send: true }
					: { ...common, send: true, scheduledAt: draft.scheduledAt },
				{ headers: { "Idempotency-Key": draft.name } },
			);
			return settle(created);
		},

		async sendBroadcast(id, scheduledAt) {
			return settle(await resend.broadcasts.send(id, scheduledAt === null ? {} : { scheduledAt }));
		},

		async upsertContact(signup) {
			const topics = signup.topicIds.map((id) => ({ id, subscription: "opt_in" as const }));
			const existing = await resend.contacts.get({ email: signup.email });
			const missing = existing.error?.name === "not_found" || existing.error?.statusCode === 404;
			if (existing.error !== null && !missing) return err(mailerError(existing.error));
			if (missing) {
				const created = settle(
					await resend.contacts.create({
						email: signup.email,
						segments: [{ id: signup.segmentId }],
						topics,
					}),
				);
				return created.ok ? ok(undefined) : created;
			}
			const added = settle(
				await resend.contacts.segments.add({ email: signup.email, segmentId: signup.segmentId }),
			);
			if (!added.ok) return added;
			const updated = settle(await resend.contacts.topics.update({ email: signup.email, topics }));
			return updated.ok ? ok(undefined) : updated;
		},
	};
}
