import { err, ok, type Result } from "@core/ids";
import { Resend, type ErrorResponse } from "resend";

/**
 * `rejected`: Resend refused the request and a retry would be refused again. `unavailable`:
 * the outcome is unknown (network, rate limit, 5xx), so the request may have taken effect.
 * `blocked`: a non-production Worker refused it before Resend saw it (send-gate.ts).
 */
export interface MailerError {
	readonly kind: "rejected" | "unavailable" | "blocked";
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
	readonly newsletterTopicId: string;
	/** Body Topics to opt in to as well. Topics not listed keep the contact's current choice. */
	readonly bodyTopicIds: readonly string[];
}

/**
 * `previously-unsubscribed`: the contact unsubscribed from all email or from the newsletter
 * Topic, so nothing was changed. A public form must never reverse a contact's choice, since
 * anyone can type anyone's address; the contact opts back in from a link in a past email.
 */
export type ContactUpsert = "subscribed" | "previously-unsubscribed";

/** The port the newsletter plugin sends through. Only plugin routes and the transport use it. */
export interface Mailer {
	sendEmail(email: OutgoingEmail): Promise<Result<{ id: string }, MailerError>>;
	findBroadcast(name: string): Promise<Result<FoundBroadcast | null, MailerError>>;
	createBroadcast(draft: BroadcastDraft): Promise<Result<{ id: string }, MailerError>>;
	sendBroadcast(
		id: string,
		scheduledAt: string | null,
	): Promise<Result<{ id: string }, MailerError>>;
	upsertContact(signup: ContactSignup): Promise<Result<ContactUpsert, MailerError>>;
	/** The address of every contact in a Segment, every page of it. */
	segmentContacts(segmentId: string): Promise<Result<readonly string[], MailerError>>;
	/** The Segment a Broadcast goes to; null when it names none. */
	broadcastSegment(id: string): Promise<Result<string | null, MailerError>>;
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

const optIn = (ids: readonly string[]) =>
	ids.map((id) => ({ id, subscription: "opt_in" as const }));

const LIST_PAGE = 100;
/** Broadcasts are listed newest first; a retry looks for a key minted moments before. */
const LIST_PAGES = 5;
/** Only a non-production Worker lists a Segment, and its test Segment holds a few inboxes. */
const SEGMENT_PAGES = 20;

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

	/** The Topics a contact has opted out of, from every page of its Topic list. */
	async function optedOut(
		email: string,
		after?: string,
		page = 1,
	): Promise<Result<ReadonlySet<string>, MailerError>> {
		const listed = settle(
			await resend.contacts.topics.list(
				after === undefined ? { email, limit: LIST_PAGE } : { email, limit: LIST_PAGE, after },
			),
		);
		if (!listed.ok) return listed;
		const out = listed.value.data.flatMap((topic) =>
			topic.subscription === "opt_out" ? [topic.id] : [],
		);
		const last = listed.value.data.at(-1);
		if (!listed.value.has_more || last === undefined) return ok(new Set(out));
		if (page >= LIST_PAGES) {
			return err({ kind: "rejected", status: null, message: "The contact has too many Topics." });
		}
		const rest = await optedOut(email, last.id, page + 1);
		return rest.ok ? ok(new Set([...out, ...rest.value])) : rest;
	}

	async function segmentContacts(
		segmentId: string,
		after?: string,
		page = 1,
	): Promise<Result<readonly string[], MailerError>> {
		const listed = settle(
			await resend.contacts.list(
				after === undefined
					? { segmentId, limit: LIST_PAGE }
					: { segmentId, limit: LIST_PAGE, after },
			),
		);
		if (!listed.ok) return listed;
		const emails = listed.value.data.map((contact) => contact.email);
		const last = listed.value.data.at(-1);
		if (!listed.value.has_more || last === undefined) return ok(emails);
		if (page >= SEGMENT_PAGES) {
			return err({
				kind: "rejected",
				status: null,
				message: `The Segment has more than ${SEGMENT_PAGES * LIST_PAGE} contacts, too many to check.`,
			});
		}
		const rest = await segmentContacts(segmentId, last.id, page + 1);
		return rest.ok ? ok([...emails, ...rest.value]) : rest;
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

		/**
		 * A new contact joins the Segment with the newsletter Topic and the chosen body Topics. An
		 * existing one keeps every choice it made: a global unsubscribe or an opt-out of the
		 * newsletter changes nothing, and a body Topic it opted out of stays out.
		 */
		async upsertContact(signup) {
			const { email, segmentId } = signup;
			const wanted = [...new Set([signup.newsletterTopicId, ...signup.bodyTopicIds])];
			const existing = await resend.contacts.get({ email });
			const missing = existing.error?.name === "not_found" || existing.error?.statusCode === 404;
			if (existing.error !== null && !missing) return err(mailerError(existing.error));
			if (missing) {
				const created = settle(
					await resend.contacts.create({
						email,
						segments: [{ id: segmentId }],
						topics: optIn(wanted),
					}),
				);
				return created.ok ? ok("subscribed") : created;
			}
			if (existing.data?.unsubscribed === true) return ok("previously-unsubscribed");
			const refused = await optedOut(email);
			if (!refused.ok) return refused;
			if (refused.value.has(signup.newsletterTopicId)) return ok("previously-unsubscribed");
			const added = settle(await resend.contacts.segments.add({ email, segmentId }));
			if (!added.ok) return added;
			const topics = optIn(wanted.filter((id) => !refused.value.has(id)));
			const updated = settle(await resend.contacts.topics.update({ email, topics }));
			return updated.ok ? ok("subscribed") : updated;
		},

		segmentContacts: async (segmentId) => segmentContacts(segmentId),

		async broadcastSegment(id) {
			const found = settle(await resend.broadcasts.get(id));
			return found.ok ? ok(found.value.segment_id || null) : found;
		},
	};
}
