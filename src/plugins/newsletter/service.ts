import type { Clock } from "@adapters/clock";
import type { IssueRecord, IssueStore, Versioned } from "@adapters/newsletter/issues";
import type { Mailer, MailerError } from "@adapters/resend-mailer";
import { err, ok, type IssueId, type Result } from "@core/ids";
import { assemble, type BodySummary, type NewsCandidate } from "@core/newsletter/assemble";
import { issueSlug, withFooter, type ComposedEmail } from "@core/newsletter/email-html";
import { refreshEvents } from "@core/newsletter/events";
import { FIRST_REVISION } from "@core/newsletter/key";
import { step, type Issue, type StepError } from "@core/newsletter/lifecycle";
import type { DocNode } from "@core/newsletter/nodes";
import { issueWindow } from "@core/newsletter/window";
import { daysAhead, expand } from "@core/recurrence/expand";
import type { EventSeries } from "@core/recurrence/series";
import { formatDate, SITE_TZ } from "@core/time";
import { Temporal } from "temporal-polyfill";

/** FR-6.1: events listed in an issue are the next 60 days' occurrences. */
const EVENT_DAYS = 60;

export interface ContentSource {
	bodies(): Promise<BodySummary[]>;
	news(): Promise<NewsCandidate[]>;
	series(): Promise<EventSeries[]>;
}

export interface NewsletterConfig {
	readonly from: string | null;
	readonly segmentId: string | null;
	readonly topicId: string | null;
	/** FR-6.4: a test send goes to these addresses and nowhere else. */
	readonly testAllowlist: readonly string[];
}

const ADDRESS = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** NEWSLETTER_TEST_ALLOWLIST: comma- or space-separated addresses; anything else is dropped. */
export function parseAllowlist(raw: string): string[] {
	const addresses = raw.split(/[\s,;]+/).filter((address) => ADDRESS.test(address));
	return [...new Set(addresses.map((address) => address.toLowerCase()))];
}

export interface NewsletterDeps {
	readonly store: IssueStore;
	/** Null when Resend is not configured. */
	readonly mailer: Mailer | null;
	readonly clock: Clock;
	readonly content: ContentSource;
	readonly config: NewsletterConfig;
	readonly newId: () => IssueId;
}

export type NewsletterErrorCode =
	| "not-found"
	| "stale"
	| "not-draft"
	| "not-tested-since-edit"
	| "events-changed"
	| "not-composed"
	| "conflict"
	| "sending"
	| "not-configured"
	| "invalid-send-at"
	| "mail-rejected"
	| "mail-unavailable";

export interface NewsletterError {
	readonly code: NewsletterErrorCode;
	readonly message: string;
}

export const ERROR_STATUS: Readonly<Record<NewsletterErrorCode, number>> = {
	"not-found": 404,
	stale: 409,
	"not-draft": 409,
	"not-tested-since-edit": 409,
	"events-changed": 409,
	"not-composed": 409,
	conflict: 409,
	sending: 409,
	"not-configured": 503,
	"invalid-send-at": 400,
	"mail-rejected": 502,
	"mail-unavailable": 503,
};

const fail = (code: NewsletterErrorCode, message: string): Result<never, NewsletterError> =>
	err({ code, message });

const STALE = fail("stale", "The issue changed since you loaded it. Reload it and try again.");
const CONFLICT = fail(
	"conflict",
	"Another request changed this issue at the same time. Reload it and try again.",
);
const NOT_FOUND = fail("not-found", "There is no issue with that id.");

const STEP_ERRORS: Readonly<Record<StepError, NewsletterError>> = {
	"not-tested-since-edit": {
		code: "not-tested-since-edit",
		message:
			"Send a test of the current version before approving. The issue has changed since its last test send.",
	},
	"not-draft": { code: "not-draft", message: "This issue has already been approved." },
	"already-creating": { code: "not-draft", message: "This issue is already being sent." },
	"not-creating": { code: "conflict", message: "This issue is not being sent." },
};

function stepped(
	issue: Issue,
	command: Parameters<typeof step>[1],
): Result<Issue, NewsletterError> {
	const result = step(issue, command);
	return result.ok ? result : err(STEP_ERRORS[result.error]);
}

function fromMailer(error: MailerError): Result<never, NewsletterError> {
	return error.kind === "rejected"
		? fail("mail-rejected", `Resend refused the request: ${error.message}`)
		: fail(
				"mail-unavailable",
				`Resend could not be reached or did not confirm (${error.message}). Try again; a retry will not send twice.`,
			);
}

/** What the admin page reads. */
export interface IssueView {
	readonly id: IssueId;
	readonly status: Issue["status"];
	readonly revision: number;
	readonly testedRevision: number | null;
	readonly subject: string;
	readonly previewText: string;
	readonly doc: DocNode;
	readonly composed: boolean;
	readonly createdAt: string;
	readonly coverage: { readonly from: string; readonly to: string };
	readonly at: string | null;
	readonly broadcastId: string | null;
	readonly slug: string | null;
}

export function view(record: IssueRecord): IssueView {
	const issue = record.lifecycle;
	const broadcast = issue.status === "scheduled" || issue.status === "sent" ? issue : null;
	return {
		id: issue.id,
		status: issue.status,
		revision: issue.revision,
		testedRevision: issue.status === "draft" ? issue.testedRevision : issue.revision,
		subject: record.content.subject,
		previewText: record.content.previewText,
		doc: record.content.doc,
		composed: record.content.email !== null,
		createdAt: record.createdAt.toString(),
		coverage: { from: issue.window.from.toString(), to: issue.window.to.toString() },
		at: broadcast?.at.toString() ?? null,
		broadcastId: broadcast?.broadcastId ?? null,
		slug: record.slug,
	};
}

export async function listIssues(deps: NewsletterDeps): Promise<IssueView[]> {
	return (await deps.store.list(50)).map(view);
}

export async function getIssue(
	deps: NewsletterDeps,
	id: string,
): Promise<Result<IssueView, NewsletterError>> {
	const found = await deps.store.get(id);
	return found === null ? NOT_FOUND : ok(view(found.record));
}

async function upcoming(deps: NewsletterDeps, now: Temporal.Instant) {
	return expand(await deps.content.series(), daysAhead(now, EVENT_DAYS));
}

/**
 * FR-6.1. Idempotent: while an issue is open (draft or being sent) "New issue" returns it, so
 * two drafts never claim the same coverage window.
 */
export async function newIssue(deps: NewsletterDeps): Promise<Result<IssueView, NewsletterError>> {
	const open = await deps.store.open();
	if (open !== null) return ok(view(open));
	const now = deps.clock.now();
	const last = await deps.store.lastBroadcast();
	const window = issueWindow(
		last === null ? null : { id: last.lifecycle.id, coverageEnd: last.lifecycle.window.to },
		now,
	);
	const [bodies, news, occurrences] = await Promise.all([
		deps.content.bodies(),
		deps.content.news(),
		upcoming(deps, now),
	]);
	const { doc } = assemble({ bodies, news, occurrences, window });
	const record: IssueRecord = {
		lifecycle: {
			status: "draft",
			id: deps.newId(),
			revision: FIRST_REVISION,
			testedRevision: null,
			window,
		},
		content: {
			subject: `Findlay Masonic Newsletter, ${formatDate(now.toZonedDateTimeISO(SITE_TZ).toPlainDate())}`,
			previewText: "",
			doc,
			email: null,
		},
		createdAt: now,
		sent: null,
		slug: null,
		sendingUntil: null,
	};
	return (await deps.store.create(record)) ? ok(view(record)) : CONFLICT;
}

async function draftAt(
	deps: NewsletterDeps,
	id: string,
	revision: number,
): Promise<Result<Versioned, NewsletterError>> {
	const found = await deps.store.get(id);
	if (found === null) return NOT_FOUND;
	if (found.record.lifecycle.status !== "draft") return err(STEP_ERRORS["not-draft"]);
	return found.record.lifecycle.revision === revision ? ok(found) : STALE;
}

export interface SaveInput {
	readonly id: string;
	readonly revision: number;
	readonly subject: string;
	readonly previewText: string;
	readonly doc: DocNode;
	/** The admin page's composeReactEmail({ editor, pretty: false }) of `doc`. */
	readonly email: ComposedEmail;
}

const sameContent = (record: IssueRecord, input: SaveInput) =>
	record.content.subject === input.subject &&
	record.content.previewText === input.previewText &&
	JSON.stringify(record.content.doc) === JSON.stringify(input.doc) &&
	JSON.stringify(record.content.email) === JSON.stringify(input.email);

/** FR-6.3. An unchanged save keeps the revision, so it neither invalidates a test send nor repeats. */
export async function saveIssue(
	deps: NewsletterDeps,
	input: SaveInput,
): Promise<Result<IssueView, NewsletterError>> {
	const found = await draftAt(deps, input.id, input.revision);
	if (!found.ok) return found;
	const { record, version } = found.value;
	if (sameContent(record, input)) return ok(view(record));
	const edited = stepped(record.lifecycle, { kind: "edit" });
	if (!edited.ok) return edited;
	const next: IssueRecord = {
		...record,
		lifecycle: edited.value,
		content: {
			subject: input.subject,
			previewText: input.previewText,
			doc: input.doc,
			email: input.email,
		},
	};
	return (await deps.store.replace(version, next)) ? ok(view(next)) : CONFLICT;
}

interface Sending {
	readonly mailer: Mailer;
	readonly from: string;
	readonly segmentId: string;
	readonly topicId: string;
	readonly testAllowlist: readonly string[];
}

const CONFIG_NAMES = {
	mailer: "RESEND_API_KEY",
	from: "RESEND_FROM",
	segmentId: "RESEND_SEGMENT_ID",
	topicId: "RESEND_NEWSLETTER_TOPIC_ID",
	testAllowlist: "NEWSLETTER_TEST_ALLOWLIST",
} as const satisfies Record<keyof Sending, string>;

/** The settings `needs` names, or a not-configured error naming each missing variable. */
function sending(
	deps: NewsletterDeps,
	needs: readonly (keyof Sending)[],
): Result<Sending, NewsletterError> {
	const { mailer, config } = deps;
	const present: Record<keyof Sending, boolean> = {
		mailer: mailer !== null,
		from: config.from !== null,
		segmentId: config.segmentId !== null,
		topicId: config.topicId !== null,
		testAllowlist: config.testAllowlist.length > 0,
	};
	const missing = needs.filter((need) => !present[need]).map((need) => CONFIG_NAMES[need]);
	if (missing.length > 0 || mailer === null) {
		return fail("not-configured", `Email sending is not configured. Set ${missing.join(", ")}.`);
	}
	return ok({
		mailer,
		from: config.from ?? "",
		segmentId: config.segmentId ?? "",
		topicId: config.topicId ?? "",
		testAllowlist: config.testAllowlist,
	});
}

const BROADCAST_NEEDS = ["mailer", "from", "segmentId", "topicId"] as const;

/** FR-6.4: the saved email of the current revision, to the allowlist only. */
export async function testSend(
	deps: NewsletterDeps,
	input: { readonly id: string; readonly revision: number },
): Promise<Result<IssueView & { readonly sentTo: readonly string[] }, NewsletterError>> {
	const setup = sending(deps, ["mailer", "from", "testAllowlist"]);
	if (!setup.ok) return setup;
	const { mailer, from, testAllowlist } = setup.value;
	const found = await draftAt(deps, input.id, input.revision);
	if (!found.ok) return found;
	const { record, version } = found.value;
	if (record.content.email === null) {
		return fail("not-composed", "Save the issue before sending a test.");
	}
	const email = withFooter(record.content.email);
	const sent = await mailer.sendEmail({
		from,
		to: testAllowlist,
		subject: `[Test] ${record.content.subject}`,
		html: email.html,
		text: email.text,
	});
	if (!sent.ok) return fromMailer(sent.error);
	const tested = stepped(record.lifecycle, {
		kind: "test-sent",
		revision: record.lifecycle.revision,
	});
	if (!tested.ok) return tested;
	const next = { ...record, lifecycle: tested.value };
	return (await deps.store.replace(version, next))
		? ok({ ...view(next), sentTo: testAllowlist })
		: CONFLICT;
}

export interface ApproveInput {
	readonly id: string;
	readonly revision: number;
	/** Null sends now. */
	readonly sendAt: Temporal.Instant | null;
}

/** How long a request holds an issue while it calls Resend; a crash frees it after this. */
const SENDING_HOLD = Temporal.Duration.from({ minutes: 2 });

/**
 * FR-6.5 to 6.7. The issue is stored as `creating`, held by this request (compare-and-set on
 * the row), before Resend is called, so of two concurrent approvals only one reaches Resend. A
 * retry that finds the issue still `creating` and unheld looks the broadcast up by its key
 * before creating one, so a crash between Resend and the store never sends twice (R3).
 */
export async function approve(
	deps: NewsletterDeps,
	input: ApproveInput,
): Promise<Result<IssueView, NewsletterError>> {
	const setup = sending(deps, BROADCAST_NEEDS);
	if (!setup.ok) return setup;
	const found = await deps.store.get(input.id);
	if (found === null) return NOT_FOUND;
	const { record, version } = found;
	const status = record.lifecycle.status;
	if (status === "creating") return resume(deps, setup.value, found);
	if (status !== "draft") return err(STEP_ERRORS["not-draft"]);
	if (record.lifecycle.revision !== input.revision) return STALE;

	const now = deps.clock.now();
	if (input.sendAt !== null && Temporal.Instant.compare(input.sendAt, now) <= 0) {
		return fail("invalid-send-at", "Choose a send time in the future, or send now.");
	}
	const approved = stepped(record.lifecycle, { kind: "approve", sendAt: input.sendAt });
	if (!approved.ok) return approved;
	const refreshed = refreshEvents(record.content.doc, await upcoming(deps, now));
	if (refreshed.changed) return refreshEventsFirst(deps, found, refreshed.doc);
	if (record.content.email === null) {
		return fail("not-composed", "Save the issue before approving it.");
	}
	const creating: IssueRecord = {
		...record,
		lifecycle: approved.value,
		sent: withFooter(record.content.email),
		slug: await freeSlug(deps, record, input.sendAt ?? now),
		sendingUntil: now.add(SENDING_HOLD),
	};
	return holdAndCreate(deps, setup.value, version, creating);
}

/** A `creating` issue whose holder ended or crashed: take the hold, then finish the send. */
async function resume(
	deps: NewsletterDeps,
	setup: Sending,
	{ record, version }: Versioned,
): Promise<Result<IssueView, NewsletterError>> {
	const now = deps.clock.now();
	const held =
		record.sendingUntil !== null && Temporal.Instant.compare(record.sendingUntil, now) > 0;
	if (held) {
		return fail("sending", "This issue is being sent right now. Wait a minute, then reload it.");
	}
	return holdAndCreate(deps, setup, version, { ...record, sendingUntil: now.add(SENDING_HOLD) });
}

async function holdAndCreate(
	deps: NewsletterDeps,
	setup: Sending,
	version: string,
	held: IssueRecord,
): Promise<Result<IssueView, NewsletterError>> {
	if (!(await deps.store.replace(version, held))) return CONFLICT;
	const stored = await deps.store.get(held.lifecycle.id);
	return stored === null ? NOT_FOUND : createBroadcast(deps, setup, stored);
}

/** R13: stale event lists are an edit, so the issue needs a new test send before approval. */
async function refreshEventsFirst(
	deps: NewsletterDeps,
	{ record, version }: Versioned,
	doc: DocNode,
): Promise<Result<never, NewsletterError>> {
	const edited = stepped(record.lifecycle, { kind: "edit" });
	if (!edited.ok) return edited;
	const next: IssueRecord = {
		...record,
		lifecycle: edited.value,
		content: { ...record.content, doc, email: null },
	};
	if (!(await deps.store.replace(version, next))) return CONFLICT;
	return fail(
		"events-changed",
		"Upcoming events changed since this issue was assembled, so it now lists the current ones. Reload it, save, send a new test, then approve.",
	);
}

/** The archive slug, suffixed "-2", "-3" when another issue already holds it. */
async function freeSlug(
	deps: NewsletterDeps,
	record: IssueRecord,
	at: Temporal.Instant,
	n = 1,
): Promise<string> {
	const base = issueSlug(record.content.subject, at);
	const slug = n === 1 ? base : `${base}-${n}`;
	const holder = await deps.store.bySlug(slug);
	if (holder === null || holder.lifecycle.id === record.lifecycle.id) return slug;
	return n >= 20 ? `${base}-${record.lifecycle.id.slice(0, 8)}` : freeSlug(deps, record, at, n + 1);
}

async function createBroadcast(
	deps: NewsletterDeps,
	{ mailer, from, segmentId, topicId }: Sending,
	{ record, version }: Versioned,
): Promise<Result<IssueView, NewsletterError>> {
	const issue = record.lifecycle;
	if (issue.status !== "creating" || record.sent === null) return err(STEP_ERRORS["not-creating"]);
	// The outcome is unknown, so the issue stays `creating`; releasing the hold lets an
	// immediate retry look the broadcast up instead of waiting for the hold to run out.
	const unconfirmed = async (error: MailerError) => {
		await deps.store.replace(version, { ...record, sendingUntil: null });
		return fromMailer(error);
	};
	const scheduledAt = issue.sendAt === null ? null : issue.sendAt.toString();
	const existing = await mailer.findBroadcast(issue.key);
	if (!existing.ok) return unconfirmed(existing.error);
	let broadcastId = existing.value?.id ?? null;
	if (existing.value?.status === "draft") {
		const started = await mailer.sendBroadcast(existing.value.id, scheduledAt);
		if (!started.ok) return unconfirmed(started.error);
	}
	if (broadcastId === null) {
		const created = await mailer.createBroadcast({
			name: issue.key,
			segmentId,
			topicId,
			from,
			subject: record.content.subject,
			previewText: record.content.previewText,
			html: record.sent.html,
			text: record.sent.text,
			scheduledAt,
		});
		if (!created.ok && created.error.kind === "unavailable") return unconfirmed(created.error);
		if (!created.ok) {
			const failed = stepped(issue, { kind: "broadcast-failed" });
			if (failed.ok) {
				await deps.store.replace(version, {
					...record,
					lifecycle: failed.value,
					sendingUntil: null,
				});
			}
			return fromMailer(created.error);
		}
		broadcastId = created.value.id;
	}
	const done = stepped(issue, {
		kind: "broadcast-created",
		broadcastId,
		at: issue.sendAt ?? deps.clock.now(),
	});
	if (!done.ok) return done;
	const next = { ...record, lifecycle: done.value, sendingUntil: null };
	if (await deps.store.replace(version, next)) return ok(view(next));
	const now = await deps.store.get(issue.id);
	return now === null ? NOT_FOUND : ok(view(now.record));
}

/** A draft can be thrown away so "New issue" can assemble again. */
export async function discardIssue(
	deps: NewsletterDeps,
	id: string,
): Promise<Result<{ readonly id: string }, NewsletterError>> {
	const found = await deps.store.get(id);
	if (found === null) return NOT_FOUND;
	if (found.record.lifecycle.status !== "draft") return err(STEP_ERRORS["not-draft"]);
	return (await deps.store.remove(id, found.version)) ? ok({ id }) : CONFLICT;
}
