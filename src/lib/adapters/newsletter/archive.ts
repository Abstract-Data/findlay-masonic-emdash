import { systemClock } from "@adapters/clock";
import { archiveHtml } from "@core/newsletter/email-html";
import { parseAbsoluteUrl } from "@adapters/emdash/parse";
import { PluginStorageRepository } from "emdash";
import { ISSUES, issueStore, type IssueStore, type StoredIssue } from "./issues";

type Database = NonNullable<App.Locals["emdash"]>["db"];

export interface ArchivedIssue {
	readonly slug: string;
	readonly subject: string;
	readonly sentAt: Date;
	readonly html: string;
}

function store(db: Database): IssueStore {
	return issueStore(
		new PluginStorageRepository<StoredIssue>(db, ISSUES.pluginId, ISSUES.collection, [
			...ISSUES.indexes,
		]),
	);
}

/** FR-6.8: sent issues for the public archive, newest first. */
export async function archivedIssues(db: Database | undefined): Promise<ArchivedIssue[]> {
	if (db === undefined) return [];
	const records = await store(db).archive(systemClock.now());
	return records.flatMap((record) => {
		const issue = record.lifecycle;
		if (record.slug === null || record.sent === null || issue.status === "draft") return [];
		if (issue.status === "creating") return [];
		return [
			{
				slug: record.slug,
				subject: record.content.subject,
				sentAt: new Date(issue.at.epochMilliseconds),
				html: record.sent.html,
			},
		];
	});
}

/**
 * One archived issue, its HTML prepared for a sandboxed frame: the per-recipient unsubscribe
 * footer points at the signup form instead.
 */
export async function archivedIssue(
	db: Database | undefined,
	slug: string,
	signupUrl: string,
): Promise<ArchivedIssue | null> {
	const found = (await archivedIssues(db)).find((issue) => issue.slug === slug);
	const url = parseAbsoluteUrl(signupUrl);
	return found === undefined || url === null
		? null
		: { ...found, html: archiveHtml(found.html, url) };
}
