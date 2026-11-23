import { ok } from "@core/ids";
import { hasUnsubscribeLink } from "@core/newsletter/email-html";
import type {
	BroadcastDraft,
	ContactSignup,
	FoundBroadcast,
	Mailer,
	OutgoingEmail,
} from "./resend-mailer";
import { DUMMY_TURNSTILE_TOKEN, type TurnstileVerifier } from "./turnstile";

/**
 * Development and test stand-ins for Resend and Turnstile. Nothing here reaches the network.
 * Only `import.meta.env.DEV` code paths import this module, so production builds never
 * contain it (scripts/check-dist.mjs proves the built bundle has no FAKE_MARKER).
 */
export const FAKE_MARKER = "findlay-dev-fake-mailer";

export interface FakeBroadcast extends BroadcastDraft, FoundBroadcast {}

export interface Outbox {
	readonly marker: typeof FAKE_MARKER;
	readonly emails: OutgoingEmail[];
	readonly broadcasts: FakeBroadcast[];
	readonly contacts: Map<string, { segments: Set<string>; topics: Set<string> }>;
	/** Every createBroadcast call, including ones a test makes fail. */
	createCalls: number;
}

export function emptyOutbox(): Outbox {
	return { marker: FAKE_MARKER, emails: [], broadcasts: [], contacts: new Map(), createCalls: 0 };
}

const GLOBAL_KEY = Symbol.for("findlay:dev-outbox");

/** One outbox per dev server, shared by every module copy Vite loads. */
export function devOutbox(): Outbox {
	const existing: unknown = Reflect.get(globalThis, GLOBAL_KEY);
	if (isOutbox(existing)) return existing;
	const fresh = emptyOutbox();
	Reflect.set(globalThis, GLOBAL_KEY, fresh);
	return fresh;
}

function isOutbox(value: unknown): value is Outbox {
	return (
		typeof value === "object" && value !== null && Reflect.get(value, "marker") === FAKE_MARKER
	);
}

export function fakeMailer(outbox: Outbox = devOutbox()): Mailer {
	return {
		async sendEmail(email) {
			outbox.emails.push(email);
			return ok({ id: `fake-email-${outbox.emails.length}` });
		},
		async findBroadcast(name) {
			const found = outbox.broadcasts.find((broadcast) => broadcast.name === name);
			return ok(found === undefined ? null : { id: found.id, status: found.status });
		},
		async createBroadcast(draft) {
			outbox.createCalls += 1;
			const id = `fake-broadcast-${outbox.broadcasts.length + 1}`;
			outbox.broadcasts.push({
				...draft,
				id,
				status: draft.scheduledAt === null ? "sent" : "queued",
			});
			return ok({ id });
		},
		async sendBroadcast(id) {
			const found = outbox.broadcasts.find((broadcast) => broadcast.id === id);
			if (found !== undefined) Object.assign(found, { status: "sent" });
			return ok({ id });
		},
		async upsertContact(signup: ContactSignup) {
			const contact = outbox.contacts.get(signup.email) ?? {
				segments: new Set(),
				topics: new Set(),
			};
			contact.segments.add(signup.segmentId);
			for (const topic of signup.topicIds) contact.topics.add(topic);
			outbox.contacts.set(signup.email, contact);
			return ok(undefined);
		},
	};
}

interface SendingConfig {
	readonly from: string | null;
	readonly segmentId: string | null;
	readonly topicId: string | null;
	readonly testAllowlist: readonly string[];
}

/** Settings the fake needs and a dev server lacks; values set in .dev.vars still win. */
export function withFakeConfig<T extends SendingConfig>(config: T): T {
	return {
		...config,
		from: config.from ?? "Findlay Masonic Temple <newsletter@example.test>",
		segmentId: config.segmentId ?? "fake-segment-subscribers",
		topicId: config.topicId ?? "fake-topic-newsletter",
		testAllowlist:
			config.testAllowlist.length > 0 ? config.testAllowlist : ["newsletter-admin@example.test"],
	};
}

/** What the dev-only outbox route shows: what Resend would have received. */
export function outboxSummary(outbox: Outbox = devOutbox()) {
	return {
		createCalls: outbox.createCalls,
		emails: outbox.emails.map(({ to, cc, replyTo, subject, html }) => ({
			to,
			cc: cc ?? [],
			replyTo: replyTo ?? null,
			subject,
			hasUnsubscribeLink: html !== undefined && hasUnsubscribeLink(html),
		})),
		broadcasts: outbox.broadcasts.map(
			({ id, name, status, segmentId, topicId, subject, html, scheduledAt }) => ({
				id,
				name,
				status,
				segmentId,
				topicId,
				subject,
				scheduledAt,
				hasUnsubscribeLink: hasUnsubscribeLink(html),
			}),
		),
		contacts: [...outbox.contacts].map(([email, contact]) => ({
			email,
			segments: [...contact.segments],
			topics: [...contact.topics],
		})),
	};
}

/** Cloudflare's always-pass test secret, offline: the dummy token passes, nothing else does. */
export const dummyVerifier: TurnstileVerifier = {
	async verify(token) {
		if (token === null || token === "") return { ok: false, reason: "missing-token", codes: [] };
		return token === DUMMY_TURNSTILE_TOKEN
			? { ok: true }
			: { ok: false, reason: "rejected", codes: ["invalid-input-response"] };
	},
};
