import type { IssueId } from "@core/ids";
import type { ComposedEmail } from "@core/newsletter/email-html";
import type { BroadcastKey, Revision } from "@core/newsletter/key";
import type { Issue } from "@core/newsletter/lifecycle";
import type { DocNode } from "@core/newsletter/nodes";
import type { IssueWindow } from "@core/newsletter/window";
import { Temporal } from "temporal-polyfill";

/** Plugin storage coordinates, shared by the plugin (ctx.storage) and the archive pages. */
export const ISSUES = {
	pluginId: "newsletter",
	collection: "issues",
	indexes: ["status", "createdAt", "coverageEnd", "at", "slug"],
};

export interface IssueContent {
	readonly subject: string;
	readonly previewText: string;
	/** TipTap JSON, the editable source of truth (constitution § Newsletter and email). */
	readonly doc: DocNode;
	/** composeReactEmail output for this revision, without the footer; null until saved. */
	readonly email: ComposedEmail | null;
}

export interface IssueRecord {
	readonly lifecycle: Issue;
	readonly content: IssueContent;
	readonly createdAt: Temporal.Instant;
	/** The footed email handed to Resend at approve time (FR-6.5); the archive shows it. */
	readonly sent: ComposedEmail | null;
	readonly slug: string | null;
	/**
	 * While a request is calling Resend for this issue, until when it holds the issue. Another
	 * request does not call Resend before then; a crashed request's hold simply runs out.
	 */
	readonly sendingUntil: Temporal.Instant | null;
}

export interface Versioned {
	readonly record: IssueRecord;
	/** Plugin storage's row revision, for compare-and-set. */
	readonly version: string;
}

/** The slice of EmDash plugin storage issues use; ctx.storage.issues and PluginStorageRepository fit. */
export interface IssueRows {
	getVersioned(id: string): Promise<{ value: unknown; revision: string } | null>;
	compareAndSet(
		id: string,
		expectedRevision: string | null,
		data: StoredIssue,
	): Promise<{ applied: boolean }>;
	compareAndDelete(id: string, expectedRevision: string): Promise<{ applied: boolean }>;
	query(options: {
		where?: Record<string, string | { in: string[] }>;
		orderBy?: Record<string, "asc" | "desc">;
		limit?: number;
	}): Promise<{ items: { id: string; data: unknown }[] }>;
}

export interface IssueStore {
	get(id: string): Promise<Versioned | null>;
	/** False when the id is taken. */
	create(record: IssueRecord): Promise<boolean>;
	/** False when the row changed since `version` was read. */
	replace(version: string, record: IssueRecord): Promise<boolean>;
	remove(id: string, version: string): Promise<boolean>;
	/** Newest first. */
	list(limit: number): Promise<IssueRecord[]>;
	/** The draft or creating issue, if any. */
	open(): Promise<IssueRecord | null>;
	/** The scheduled or sent issue whose coverage ends last (FR-6.1 window). */
	lastBroadcast(): Promise<IssueRecord | null>;
	bySlug(slug: string): Promise<IssueRecord | null>;
	/** FR-6.8: sent issues, and scheduled ones whose time has come, newest first. */
	archive(now: Temporal.Instant): Promise<IssueRecord[]>;
}

/** The stored JSON. Instants are fixed-width ISO strings so indexed text sorts by time. */
export interface StoredIssue {
	readonly status: Issue["status"];
	readonly revision: number;
	readonly testedRevision: number | null;
	readonly window: {
		readonly kind: IssueWindow["kind"];
		readonly from: string;
		readonly to: string;
		readonly previous: string | null;
	};
	readonly coverageEnd: string;
	readonly key: string | null;
	readonly sendAt: string | null;
	readonly broadcastId: string | null;
	readonly at: string | null;
	readonly subject: string;
	readonly previewText: string;
	readonly doc: DocNode;
	readonly email: ComposedEmail | null;
	readonly sent: ComposedEmail | null;
	readonly slug: string | null;
	readonly sendingUntil: string | null;
	readonly createdAt: string;
}

export function iso(at: Temporal.Instant): string {
	return at.toString({ smallestUnit: "millisecond" });
}

export function toStored(record: IssueRecord): StoredIssue {
	const { lifecycle: issue, content } = record;
	const window = issue.window;
	return {
		status: issue.status,
		revision: issue.revision,
		testedRevision: issue.status === "draft" ? issue.testedRevision : null,
		window: {
			kind: window.kind,
			from: iso(window.from),
			to: iso(window.to),
			previous: window.kind === "since-last" ? window.previous : null,
		},
		coverageEnd: iso(window.to),
		key: issue.status === "draft" ? null : issue.key,
		sendAt: issue.status === "creating" && issue.sendAt !== null ? iso(issue.sendAt) : null,
		broadcastId: issue.status === "scheduled" || issue.status === "sent" ? issue.broadcastId : null,
		at: issue.status === "scheduled" || issue.status === "sent" ? iso(issue.at) : null,
		subject: content.subject,
		previewText: content.previewText,
		doc: content.doc,
		email: content.email,
		sent: record.sent,
		slug: record.slug,
		sendingUntil: record.sendingUntil === null ? null : iso(record.sendingUntil),
		createdAt: iso(record.createdAt),
	};
}

// Type predicates mint the brands: each one is the validation the brand stands for.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isIssueId = (raw: unknown): raw is IssueId => typeof raw === "string" && UUID.test(raw);
const isRevision = (raw: unknown): raw is Revision =>
	typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 1;
const isBroadcastKey = (raw: unknown): raw is BroadcastKey =>
	typeof raw === "string" && raw.startsWith("fm-issue:") && raw.length <= 256;

export function parseIssueId(raw: unknown): IssueId | null {
	return isIssueId(raw) ? raw : null;
}

function instant(raw: unknown): Temporal.Instant | null {
	if (typeof raw !== "string") return null;
	try {
		return Temporal.Instant.from(raw);
	} catch {
		return null;
	}
}

const field = (raw: object, key: string): unknown => Reflect.get(raw, key);

/** A TipTap JSON node, checked all the way down; anything else is not a document. */
export function parseDoc(raw: unknown, depth = 0): DocNode | null {
	if (depth > 64 || typeof raw !== "object" || raw === null) return null;
	const type: unknown = field(raw, "type");
	const attrs: unknown = field(raw, "attrs");
	const content: unknown = field(raw, "content");
	const text: unknown = field(raw, "text");
	const marks: unknown = field(raw, "marks");
	if (typeof type !== "string" || type === "") return null;
	if (attrs !== undefined && (typeof attrs !== "object" || attrs === null)) return null;
	if (text !== undefined && typeof text !== "string") return null;
	if (marks !== undefined && !Array.isArray(marks)) return null;
	if (content !== undefined && !Array.isArray(content)) return null;
	const children = content?.map((child: unknown) => parseDoc(child, depth + 1));
	if (children?.some((child) => child === null)) return null;
	return {
		type,
		...(attrs === undefined ? {} : { attrs: { ...attrs } }),
		...(children === undefined ? {} : { content: children.filter((c) => c !== null) }),
		...(text === undefined ? {} : { text }),
		...(marks === undefined ? {} : { marks }),
	};
}

export function parseEmail(raw: unknown): ComposedEmail | null {
	if (typeof raw !== "object" || raw === null) return null;
	const html: unknown = field(raw, "html");
	const text: unknown = field(raw, "text");
	return typeof html === "string" && typeof text === "string" ? { html, text } : null;
}

function parseWindow(raw: unknown): IssueWindow | null {
	if (typeof raw !== "object" || raw === null) return null;
	const from = instant(field(raw, "from"));
	const to = instant(field(raw, "to"));
	const kind: unknown = field(raw, "kind");
	const previous = parseIssueId(field(raw, "previous"));
	if (from === null || to === null) return null;
	if (kind === "first") return { kind, from, to };
	return kind === "since-last" && previous !== null ? { kind, from, to, previous } : null;
}

function parseLifecycle(id: IssueId, raw: object): Issue | null {
	const status: unknown = field(raw, "status");
	const revision: unknown = field(raw, "revision");
	const window = parseWindow(field(raw, "window"));
	if (!isRevision(revision) || window === null) return null;
	if (status === "draft") {
		const tested: unknown = field(raw, "testedRevision");
		const testedRevision = isRevision(tested) ? tested : null;
		return { status, id, revision, testedRevision, window };
	}
	const key: unknown = field(raw, "key");
	if (!isBroadcastKey(key)) return null;
	if (status === "creating") {
		const sendAt = field(raw, "sendAt") === null ? null : instant(field(raw, "sendAt"));
		return { status, id, revision, key, sendAt, window };
	}
	const broadcastId: unknown = field(raw, "broadcastId");
	const at = instant(field(raw, "at"));
	if ((status !== "scheduled" && status !== "sent") || typeof broadcastId !== "string") return null;
	return at === null ? null : { status, id, revision, key, broadcastId, at, window };
}

/** A stored row as a record; a row that does not parse is treated as absent. */
export function parseStoredIssue(rawId: string, raw: unknown): IssueRecord | null {
	const id = parseIssueId(rawId);
	if (id === null || typeof raw !== "object" || raw === null) return null;
	const lifecycle = parseLifecycle(id, raw);
	const doc = parseDoc(field(raw, "doc"));
	const createdAt = instant(field(raw, "createdAt"));
	const subject: unknown = field(raw, "subject");
	const previewText: unknown = field(raw, "previewText");
	const slug: unknown = field(raw, "slug");
	if (lifecycle === null || doc === null || createdAt === null || typeof subject !== "string") {
		return null;
	}
	return {
		lifecycle,
		content: {
			subject,
			previewText: typeof previewText === "string" ? previewText : "",
			doc,
			email: parseEmail(field(raw, "email")),
		},
		createdAt,
		sent: parseEmail(field(raw, "sent")),
		slug: typeof slug === "string" ? slug : null,
		sendingUntil: instant(field(raw, "sendingUntil")),
	};
}

const BROADCAST = { in: ["scheduled", "sent"] };

const records = (items: readonly { id: string; data: unknown }[]) =>
	items.flatMap((item) => parseStoredIssue(item.id, item.data) ?? []);

export function issueStore(rows: IssueRows): IssueStore {
	const first = async (options: Parameters<IssueRows["query"]>[0]) =>
		records((await rows.query({ ...options, limit: 1 })).items)[0] ?? null;

	return {
		async get(id) {
			const found = await rows.getVersioned(id);
			const record = found === null ? null : parseStoredIssue(id, found.value);
			return found === null || record === null ? null : { record, version: found.revision };
		},
		async create(record) {
			return (await rows.compareAndSet(record.lifecycle.id, null, toStored(record))).applied;
		},
		async replace(version, record) {
			return (await rows.compareAndSet(record.lifecycle.id, version, toStored(record))).applied;
		},
		async remove(id, version) {
			return (await rows.compareAndDelete(id, version)).applied;
		},
		async list(limit) {
			return records((await rows.query({ orderBy: { createdAt: "desc" }, limit })).items);
		},
		open: async () => first({ where: { status: { in: ["draft", "creating"] } } }),
		lastBroadcast: async () =>
			first({ where: { status: BROADCAST }, orderBy: { coverageEnd: "desc" } }),
		bySlug: async (slug) => first({ where: { slug } }),
		async archive(now) {
			const items = (await rows.query({ where: { status: BROADCAST }, orderBy: { at: "desc" } }))
				.items;
			return records(items).filter(
				(record) =>
					record.lifecycle.status === "sent" ||
					(record.lifecycle.status === "scheduled" &&
						Temporal.Instant.compare(record.lifecycle.at, now) <= 0),
			);
		},
	};
}
