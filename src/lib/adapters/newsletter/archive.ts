import { parseAbsoluteUrl } from "@adapters/emdash/parse";
import { archiveHtml } from "@core/newsletter/email-html";
import { z } from "astro/zod";
import {
	getPublicPluginApiRouteHandler,
	type PublicPluginRuntimeLocals,
} from "emdash/plugin-utils";
import { ISSUES } from "./issues";

/** The archive/issue route's error code for a slug no sent issue holds. */
export const ISSUE_NOT_FOUND = "ISSUE_NOT_FOUND";

export interface ArchivedIssue {
	readonly slug: string;
	readonly subject: string;
	readonly sentAt: Date;
}

export interface ArchivedEmail extends ArchivedIssue {
	/** The sent email, its per-recipient unsubscribe footer swapped for a signup link. */
	readonly html: string;
}

const listed = z.object({
	slug: z.string().min(1),
	subject: z.string(),
	sentAt: z.iso.datetime({ offset: true }).transform((at) => new Date(at)),
});
const listing = z.object({ issues: z.array(listed) });
const email = listed.extend({ html: z.string() });

/**
 * Reads the newsletter plugin's public archive routes in-process. EmDash gives an anonymous
 * visitor's page this dispatcher and no database handle, so it is the one read path that works
 * for every visitor. A failure throws: an empty archive must mean nothing was sent.
 */
async function archiveRoute(
	locals: PublicPluginRuntimeLocals,
	pageUrl: URL,
	route: "archive/list" | "archive/issue",
	query: Record<string, string> = {},
): Promise<{ status: "ok"; data: unknown } | { status: "not-found" }> {
	const dispatch = getPublicPluginApiRouteHandler(locals);
	if (dispatch === undefined) throw new Error("newsletter archive: EmDash is not initialised");
	const url = new URL(`/_emdash/api/plugins/${ISSUES.pluginId}/${route}`, pageUrl);
	for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
	const response = await dispatch(ISSUES.pluginId, "GET", `/${route}`, new Request(url));
	if (response.success) return { status: "ok", data: response.data };
	const code = response.error?.code;
	if (code === ISSUE_NOT_FOUND || code === "VALIDATION_ERROR") return { status: "not-found" };
	throw new Error(`newsletter archive: ${route} failed: ${response.error?.message ?? "unknown"}`);
}

/** FR-6.8: sent issues for the public archive, newest first. */
export async function archivedIssues(
	locals: PublicPluginRuntimeLocals,
	pageUrl: URL,
): Promise<ArchivedIssue[]> {
	const answer = await archiveRoute(locals, pageUrl, "archive/list");
	if (answer.status === "not-found") throw new Error("newsletter archive: archive/list is missing");
	return listing.parse(answer.data).issues;
}

/** One archived issue, its HTML prepared for a sandboxed frame; null when none has the slug. */
export async function archivedEmail(
	locals: PublicPluginRuntimeLocals,
	pageUrl: URL,
	slug: string,
): Promise<ArchivedEmail | null> {
	const signupUrl = parseAbsoluteUrl(new URL("/newsletters#signup", pageUrl).href);
	if (signupUrl === null) return null;
	const answer = await archiveRoute(locals, pageUrl, "archive/issue", { slug });
	if (answer.status === "not-found") return null;
	const found = email.parse(answer.data);
	return { ...found, html: archiveHtml(found.html, signupUrl) };
}
