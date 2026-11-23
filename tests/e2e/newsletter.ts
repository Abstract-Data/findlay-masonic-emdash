import type { APIRequestContext } from "@playwright/test";
import { data, NEWS, unique } from "./body-access";

export const NEWSLETTER_API = "/_emdash/api/plugins/newsletter";

/** What the dev server's fake Resend received (GET dev/outbox, Admin, dev only). */
export interface Outbox {
	readonly createCalls: number;
	readonly emails: readonly {
		readonly to: readonly string[];
		readonly cc: readonly string[];
		readonly replyTo: string | null;
		readonly subject: string;
		readonly hasUnsubscribeLink: boolean;
	}[];
	readonly broadcasts: readonly {
		readonly id: string;
		readonly name: string;
		readonly segmentId: string;
		readonly topicId: string;
		readonly subject: string;
		readonly hasUnsubscribeLink: boolean;
	}[];
	readonly contacts: readonly {
		readonly email: string;
		readonly segments: readonly string[];
		readonly topics: readonly string[];
		readonly unsubscribed: boolean;
	}[];
}

export async function outbox(admin: APIRequestContext): Promise<Outbox> {
	return data<Outbox>(admin.get(`${NEWSLETTER_API}/dev/outbox`));
}

/** The fake's defaults (src/lib/adapters/dev-fakes.ts withFakeConfig). */
export const FAKE = {
	segment: "fake-segment-subscribers",
	topic: "fake-topic-newsletter",
	allowlist: ["newsletter-admin@example.test"],
};

/** A published news item in `body`, dated just now so the next issue includes it. */
export async function publishedNews(
	client: APIRequestContext,
	body: string,
	title: string,
): Promise<string> {
	const created = await data<{ item: { id: string } }>(
		client.post(NEWS, {
			data: {
				data: {
					title,
					body,
					content: [
						{
							_type: "block",
							_key: "b1",
							children: [{ _type: "span", _key: "s1", text: `${title}.` }],
						},
					],
					publish_date: new Date(Date.now() - 5_000).toISOString(),
					include_in_newsletter: true,
				},
				slug: unique("news"),
			},
		}),
	);
	await data(client.post(`${NEWS}/${created.item.id}/publish`, { data: {} }));
	return created.item.id;
}

/** Throws away any draft a failed earlier run left, so "New issue" assembles afresh. */
export async function discardOpenDrafts(admin: APIRequestContext): Promise<void> {
	const { issues } = await data<{ issues: { id: string; status: string }[] }>(
		admin.get(`${NEWSLETTER_API}/issues/list`),
	);
	for (const issue of issues.filter((i) => i.status === "draft")) {
		// oxlint-disable-next-line no-await-in-loop -- at most one open draft exists.
		await data(admin.post(`${NEWSLETTER_API}/issues/discard`, { data: { id: issue.id } }));
	}
}
