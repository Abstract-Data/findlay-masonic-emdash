import { systemClock } from "@adapters/clock";
import { parseEventSeries } from "@adapters/emdash/parse";
import { ISSUE_NOT_FOUND } from "@adapters/newsletter/archive";
import { parseBodies, parseNewsCandidate, type ListedItem } from "@adapters/newsletter/content";
import { issueStore, parseDoc, type IssueRows } from "@adapters/newsletter/issues";
import type { IssueId } from "@core/ids";
import { z } from "astro/zod";
import {
	PluginRouteError,
	pluginResponse,
	type PluginContext,
	type PluginRoute,
	type RouteContext,
} from "emdash";
import { Temporal } from "temporal-polyfill";
import { runtime } from "./runtime";
import {
	approve,
	discardIssue,
	ERROR_STATUS,
	getIssue,
	listIssues,
	newIssue,
	publishedIssues,
	saveIssue,
	testSend,
	type ContentSource,
	type NewsletterDeps,
	type NewsletterError,
} from "./service";
import { sameSite, SIGNUP_PAGE, subscribe, type SubscribeRequest } from "./subscribe";

/** Admins only (spec Q5): EmDash grants settings:manage to role 50 alone. */
export const ADMIN_PERMISSION = "settings:manage";

const PAGE = 100;

async function published(
	ctx: PluginContext,
	collection: string,
	cursor?: string,
): Promise<ListedItem[]> {
	const page = await ctx.content?.list(collection, {
		where: { status: "published" },
		limit: PAGE,
		...(cursor === undefined ? {} : { cursor }),
	});
	if (page === undefined) return [];
	const items = page.items.map(({ id, slug, data, publishedAt }) => ({
		id,
		slug,
		data,
		publishedAt,
	}));
	return page.hasMore && page.cursor !== undefined
		? [...items, ...(await published(ctx, collection, page.cursor))]
		: items;
}

function siteOrigin(ctx: RouteContext): string {
	return URL.canParse(ctx.site.url)
		? new URL(ctx.site.url).origin
		: new URL(ctx.request.url).origin;
}

function contentSource(ctx: RouteContext): ContentSource {
	const origin = siteOrigin(ctx);
	const bodies = async () => parseBodies(await published(ctx, "bodies"));
	return {
		bodies: async () => (await bodies()).bodies,
		async news() {
			const [{ slugs }, items] = await Promise.all([bodies(), published(ctx, "news")]);
			return items.flatMap((item) => parseNewsCandidate(item, slugs, origin) ?? []);
		},
		async series() {
			const items = await published(ctx, "events");
			return items.flatMap((item) => {
				const parsed = parseEventSeries({ ...item.data, id: item.id });
				return parsed.ok ? [parsed.value] : [];
			});
		},
	};
}

function issueRows(ctx: PluginContext): IssueRows {
	const rows = ctx.storage.issues;
	if (rows === undefined) throw new Error("newsletter: the issues storage collection is missing");
	return rows;
}

async function deps(ctx: RouteContext): Promise<NewsletterDeps> {
	const { mailer, config } = await runtime();
	return {
		store: issueStore(issueRows(ctx)),
		mailer,
		clock: systemClock,
		content: contentSource(ctx),
		config,
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a fresh UUID is the id parseIssueId accepts.
		newId: () => crypto.randomUUID() as IssueId,
	};
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: NewsletterError }): T {
	if (result.ok) return result.value;
	const code = result.error.code.toUpperCase().replaceAll("-", "_");
	throw new PluginRouteError(code, result.error.message, ERROR_STATUS[result.error.code]);
}

const id = z.string().min(1).max(64);
const revision = z.number().int().min(1);
const byId = z.object({ id });
const bySlug = z.object({ slug: z.string().min(1).max(200) });
const saveInput = z.object({
	id,
	revision,
	subject: z.string().trim().min(1).max(200),
	previewText: z.string().trim().max(200),
	doc: z.unknown(),
	email: z.object({ html: z.string().min(1).max(4_000_000), text: z.string().max(1_000_000) }),
});
const testInput = z.object({ id, revision });
const approveInput = z.object({
	id,
	revision,
	sendAt: z.string().max(64).nullable().default(null),
});

function instant(raw: string | null): Temporal.Instant | null | "invalid" {
	if (raw === null || raw === "") return null;
	try {
		return Temporal.Instant.from(raw);
	} catch {
		return "invalid";
	}
}

const admin = { permission: ADMIN_PERMISSION } as const;

export const routes: Record<string, PluginRoute> = {
	"issues/list": {
		...admin,
		methods: ["GET"],
		handler: async (ctx: RouteContext) => ({ issues: await listIssues(await deps(ctx)) }),
	},
	"issues/get": {
		...admin,
		methods: ["GET"],
		input: byId,
		handler: async (ctx: RouteContext<z.infer<typeof byId>>) =>
			unwrap(await getIssue(await deps(ctx), ctx.input.id)),
	},
	"issues/new": {
		...admin,
		methods: ["POST"],
		handler: async (ctx: RouteContext) => unwrap(await newIssue(await deps(ctx))),
	},
	"issues/save": {
		...admin,
		methods: ["POST"],
		request: { body: "json", maxBytes: 6 * 1024 * 1024 },
		input: saveInput,
		handler: async (ctx: RouteContext<z.infer<typeof saveInput>>) => {
			const doc = parseDoc(ctx.input.doc);
			if (doc === null || doc.type !== "doc") {
				throw PluginRouteError.badRequest("The issue body is not an editor document.");
			}
			return unwrap(await saveIssue(await deps(ctx), { ...ctx.input, doc }));
		},
	},
	"issues/test-send": {
		...admin,
		methods: ["POST"],
		input: testInput,
		handler: async (ctx: RouteContext<z.infer<typeof testInput>>) =>
			unwrap(await testSend(await deps(ctx), ctx.input)),
	},
	"issues/approve": {
		...admin,
		methods: ["POST"],
		input: approveInput,
		handler: async (ctx: RouteContext<z.infer<typeof approveInput>>) => {
			const sendAt = instant(ctx.input.sendAt);
			if (sendAt === "invalid") throw PluginRouteError.badRequest("The send time is not valid.");
			return unwrap(await approve(await deps(ctx), { ...ctx.input, sendAt }));
		},
	},
	"issues/discard": {
		...admin,
		methods: ["POST"],
		input: byId,
		handler: async (ctx: RouteContext<z.infer<typeof byId>>) =>
			unwrap(await discardIssue(await deps(ctx), ctx.input.id)),
	},
	/**
	 * FR-6.8: the public archive pages read through these. A visitor's page has no database
	 * handle, only EmDash's public plugin route dispatcher, so the issues come from here.
	 */
	"archive/list": {
		public: true,
		methods: ["GET"],
		handler: async (ctx: RouteContext) => ({
			issues: (await publishedIssues(issueStore(issueRows(ctx)), systemClock.now())).map(
				({ slug, subject, sentAt }) => ({ slug, subject, sentAt }),
			),
		}),
	},
	"archive/issue": {
		public: true,
		methods: ["GET"],
		input: bySlug,
		handler: async (ctx: RouteContext<z.infer<typeof bySlug>>) => {
			const issues = await publishedIssues(issueStore(issueRows(ctx)), systemClock.now());
			const found = issues.find((issue) => issue.slug === ctx.input.slug);
			if (found === undefined) {
				throw new PluginRouteError(ISSUE_NOT_FOUND, "No sent issue has that slug.", 404);
			}
			return found;
		},
	},
	/** FR-7.1, FR-7.2: the public signup form posts here; the answer redirects back to it. */
	subscribe: {
		public: true,
		methods: ["POST"],
		request: { body: "form-data", maxBytes: 16 * 1024 },
		response: "raw",
		handler: async (ctx: RouteContext) => {
			const headers = ctx.request.headers;
			const request: SubscribeRequest = {
				origin: headers.get("Origin"),
				csrfHeader: headers.get("X-EmDash-Request"),
				siteOrigins: [...new Set([new URL(ctx.request.url).origin, siteOrigin(ctx)])],
				fields: formFields(ctx.input),
				remoteIp: ctx.requestMeta.ip,
			};
			if (!sameSite(request)) {
				return pluginResponse({
					status: 403,
					headers: { "content-type": "text/plain; charset=utf-8" },
					body: { kind: "text", value: "Signups are accepted only from this site's form." },
				});
			}
			const { mailer, verifier, config } = await runtime();
			const outcome = await subscribe(
				{
					mailer,
					verifier,
					segmentId: config.segmentId,
					newsletterTopicId: config.topicId,
					bodyTopics: bodyTopics(await published(ctx, "bodies")),
				},
				request,
			);
			return pluginResponse({
				status: 303,
				headers: { location: `${SIGNUP_PAGE}?subscribe=${outcome}#signup` },
			});
		},
	},
	...(import.meta.env.DEV
		? {
				"dev/outbox": {
					...admin,
					methods: ["GET"],
					handler: async () => (await import("@adapters/dev-fakes")).outboxSummary(),
				},
			}
		: {}),
};

function formFields(input: unknown): SubscribeRequest["fields"] {
	const entries: unknown =
		typeof input === "object" && input !== null ? Reflect.get(input, "entries") : null;
	if (!Array.isArray(entries)) return [];
	return entries.flatMap((entry: unknown) => {
		if (typeof entry !== "object" || entry === null) return [];
		const name: unknown = Reflect.get(entry, "name");
		const value: unknown = Reflect.get(entry, "value");
		return typeof name === "string" && typeof value === "string" ? [{ name, value }] : [];
	});
}

/** Body id to `resend_topic_id`, so a signup opts in to the bodies it ticked (FR-7.1). */
function bodyTopics(items: readonly ListedItem[]): Map<string, string | null> {
	return new Map(
		items.map((item) => {
			const topic = item.data.resend_topic_id;
			return [item.id, typeof topic === "string" && topic.trim() !== "" ? topic.trim() : null];
		}),
	);
}
