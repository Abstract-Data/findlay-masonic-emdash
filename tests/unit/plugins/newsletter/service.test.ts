import { emptyOutbox, fakeMailer, type Outbox } from "@adapters/dev-fakes";
import { issueStore } from "@adapters/newsletter/issues";
import type { Mailer } from "@adapters/resend-mailer";
import { err, ok } from "@core/ids";
import type { BodySummary, NewsCandidate } from "@core/newsletter/assemble";
import { UNSUBSCRIBE_PLACEHOLDER } from "@core/newsletter/email-html";
import type { EventSeries } from "@core/recurrence/series";
import {
	approve,
	newIssue,
	publishedIssues,
	saveIssue,
	testSend,
	type IssueView,
	type NewsletterDeps,
} from "@plugins/newsletter/service";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE, entryId, instant, issueUuid, series, timed, url } from "../../fixtures";
import { MemoryRows } from "./memory-rows";

const NOW = instant("2027-04-15T14:00:00Z");
const BODIES: BodySummary[] = [
	{ id: CHAPTER, name: "Findlay Chapter No. 58", displayOrder: 2 },
	{ id: LODGE, name: "Findlay Lodge No. 227", displayOrder: 1 },
];
const STATED = series({
	body: LODGE,
	timing: timed("2027-01-12T19:30", "2027-01-12T21:30"),
	rrule: "FREQ=MONTHLY;BYDAY=2TU",
});

function news(n: number, body: typeof LODGE, publishedAt: string): NewsCandidate {
	return {
		id: entryId(n),
		body,
		title: `News ${n}`,
		content: [{ _type: "block", children: [{ _type: "span", text: `Body of news ${n}.` }] }],
		href: url(`https://findlaymason.org/bodies/x/news#${n}`),
		image: null,
		publishedAt: instant(publishedAt),
		includeInNewsletter: true,
	};
}

interface World {
	readonly deps: NewsletterDeps;
	readonly rows: MemoryRows;
	readonly outbox: Outbox;
	readonly events: EventSeries[];
	/** The fake Resend the deps send through. */
	readonly mailer: Mailer;
	readonly advance: (minutes: number) => void;
}

function world(overrides: Partial<NewsletterDeps> = {}): World {
	const rows = new MemoryRows();
	const outbox = emptyOutbox();
	const mailer = fakeMailer(outbox);
	const events: EventSeries[] = [STATED];
	let ids = 0;
	let now = NOW;
	const deps: NewsletterDeps = {
		store: issueStore(rows),
		mailer,
		clock: { now: () => now },
		content: {
			bodies: async () => BODIES,
			news: async () => [
				news(1, LODGE, "2027-03-01T12:00:00Z"),
				news(2, CHAPTER, "2027-04-01T12:00:00Z"),
			],
			series: async () => events,
		},
		config: {
			from: "Findlay Masonic Temple <news@example.test>",
			segmentId: "segment-subscribers",
			topicId: "topic-newsletter",
			testAllowlist: ["secretary@example.test"],
		},
		newId: () => issueUuid((ids += 1)),
		...overrides,
	};
	const advance = (minutes: number) => {
		now = now.add({ minutes });
	};
	return { deps, rows, outbox, events, mailer, advance };
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
	if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
	return result.value;
}

const EMAIL = { html: "<html><body><p>Brethren,</p></body></html>", text: "Brethren," };

async function saved(deps: NewsletterDeps, issue: IssueView, subject = issue.subject) {
	return value(
		await saveIssue(deps, {
			id: issue.id,
			revision: issue.revision,
			subject,
			previewText: "",
			doc: issue.doc,
			email: EMAIL,
		}),
	);
}

/** New issue, saved (composed) and test-sent: ready to approve. */
async function tested(deps: NewsletterDeps): Promise<IssueView> {
	const draft = await saved(deps, value(await newIssue(deps)));
	return value(await testSend(deps, { id: draft.id, revision: draft.revision }));
}

const sections = (issue: IssueView) =>
	JSON.stringify(issue.doc)
		.match(/"heading":"[^"]+"/g)
		?.map((h) => h.slice(11, -1));

describe("newsletter issues (FR-6.1 to 6.7)", () => {
	it("starts an issue with one section per body in body order, and reopens it while open", async () => {
		const { deps } = world();
		const first = value(await newIssue(deps));
		expect(first.status).toBe("draft");
		expect(sections(first)).toEqual(["Findlay Lodge No. 227", "Findlay Chapter No. 58"]);
		expect(value(await newIssue(deps)).id).toBe(first.id);
	});

	it("FR-6.6: refuses to approve an issue never test-sent, and creates no broadcast", async () => {
		const { deps, outbox } = world();
		const draft = await saved(deps, value(await newIssue(deps)));
		const refused = await approve(deps, { id: draft.id, revision: draft.revision, sendAt: null });
		expect(refused).toMatchObject({ ok: false, error: { code: "not-tested-since-edit" } });
		expect(outbox.createCalls).toBe(0);
	});

	it("FR-6.6: refuses to approve after an edit that followed the test send", async () => {
		const { deps, outbox } = world();
		const edited = await saved(deps, await tested(deps), "Spring news, revised");
		const refused = await approve(deps, { id: edited.id, revision: edited.revision, sendAt: null });
		expect(refused).toMatchObject({ ok: false, error: { code: "not-tested-since-edit" } });
		expect(outbox.createCalls).toBe(0);
	});

	it("keeps the revision when a save changes nothing, so the test send still counts", async () => {
		const { deps } = world();
		const issue = await tested(deps);
		expect((await saved(deps, issue)).revision).toBe(issue.revision);
		expect(
			value(await approve(deps, { id: issue.id, revision: issue.revision, sendAt: null })).status,
		).toBe("sent");
	});

	it("FR-6.4: test-sends the saved email to the allowlist only, with the unsubscribe footer", async () => {
		const { deps, outbox } = world();
		const issue = await tested(deps);
		expect(outbox.emails).toHaveLength(1);
		expect(outbox.emails[0]).toMatchObject({
			to: ["secretary@example.test"],
			subject: `[Test] ${issue.subject}`,
		});
		expect(outbox.emails[0]?.html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
		expect(issue.testedRevision).toBe(issue.revision);
	});

	it("refuses a test send before the issue is saved", async () => {
		const { deps, outbox } = world();
		const draft = value(await newIssue(deps));
		const refused = await testSend(deps, { id: draft.id, revision: draft.revision });
		expect(refused).toMatchObject({ ok: false, error: { code: "not-composed" } });
		expect(outbox.emails).toHaveLength(0);
	});

	it("FR-6.5, 6.7: creates one broadcast to the Segment under the newsletter Topic and records it", async () => {
		const { deps, outbox, rows } = world();
		const issue = await tested(deps);
		const sent = value(
			await approve(deps, { id: issue.id, revision: issue.revision, sendAt: null }),
		);
		expect(outbox.broadcasts).toHaveLength(1);
		const broadcast = outbox.broadcasts[0];
		expect(broadcast).toMatchObject({
			name: `fm-issue:${issue.id}:rev:${issue.revision}`,
			segmentId: "segment-subscribers",
			topicId: "topic-newsletter",
			subject: issue.subject,
			scheduledAt: null,
		});
		expect(broadcast?.html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
		expect(sent).toMatchObject({
			status: "sent",
			broadcastId: broadcast?.id,
			at: NOW.toString(),
			slug: "2027-04-15-findlay-masonic-newsletter-apr-15-2027",
		});
		const stored = await rows.getVersioned(issue.id);
		expect(JSON.stringify(stored?.value)).toContain(JSON.stringify(broadcast?.html));
	});

	it("schedules the broadcast when a future send time is chosen", async () => {
		const { deps, outbox } = world();
		const issue = await tested(deps);
		const sendAt = instant("2027-04-20T13:00:00Z");
		const scheduled = value(
			await approve(deps, { id: issue.id, revision: issue.revision, sendAt }),
		);
		expect(scheduled).toMatchObject({ status: "scheduled", at: sendAt.toString() });
		expect(outbox.broadcasts[0]?.scheduledAt).toBe(sendAt.toString());
	});

	it("refuses a send time in the past", async () => {
		const { deps } = world();
		const issue = await tested(deps);
		const refused = await approve(deps, {
			id: issue.id,
			revision: issue.revision,
			sendAt: instant("2027-04-15T13:00:00Z"),
		});
		expect(refused).toMatchObject({ ok: false, error: { code: "invalid-send-at" } });
	});

	it("refuses an approval for a revision the caller did not see", async () => {
		const { deps } = world();
		const issue = await tested(deps);
		const refused = await approve(deps, {
			id: issue.id,
			revision: issue.revision - 1,
			sendAt: null,
		});
		expect(refused).toMatchObject({ ok: false, error: { code: "stale" } });
	});

	it("names the missing settings when Resend is not configured", async () => {
		const { deps } = world();
		const issue = await tested(deps);
		const unconfigured = { ...deps, mailer: null, config: { ...deps.config, topicId: null } };
		const refused = await approve(unconfigured, {
			id: issue.id,
			revision: issue.revision,
			sendAt: null,
		});
		expect(refused).toMatchObject({ ok: false, error: { code: "not-configured" } });
		expect(refused.ok ? "" : refused.error.message).toContain(
			"RESEND_API_KEY, RESEND_NEWSLETTER_TOPIC_ID",
		);
	});
});

describe("approve is idempotent (FR-6.7, R3)", () => {
	it("two approve calls make exactly one broadcast create", async () => {
		const { deps, outbox } = world();
		const issue = await tested(deps);
		const input = { id: issue.id, revision: issue.revision, sendAt: null };
		const first = await approve(deps, input);
		const second = await approve(deps, input);
		expect(first.ok).toBe(true);
		expect(second).toMatchObject({ ok: false, error: { code: "not-draft" } });
		expect(outbox.createCalls).toBe(1);
	});

	it("two concurrent approve calls make exactly one broadcast create", async () => {
		const { deps, outbox } = world();
		const issue = await tested(deps);
		const input = { id: issue.id, revision: issue.revision, sendAt: null };
		const results = await Promise.all([approve(deps, input), approve(deps, input)]);
		expect(results.filter((result) => result.ok)).toHaveLength(1);
		expect(outbox.createCalls).toBe(1);
	});

	it("a retry after a crash between Resend and the store finds the broadcast by its key", async () => {
		const { deps, outbox, rows, advance } = world();
		const issue = await tested(deps);
		const input = { id: issue.id, revision: issue.revision, sendAt: null };
		// Write 1 stores `creating`, Resend creates the broadcast, write 2 (recording it) crashes.
		rows.crashOnWrite(2);
		await expect(approve(deps, input)).rejects.toThrow("storage went away");
		expect(outbox.createCalls).toBe(1);
		expect(await approve(deps, input)).toMatchObject({ ok: false, error: { code: "sending" } });
		advance(3);
		const retried = value(await approve(deps, input));
		expect(retried).toMatchObject({ status: "sent", broadcastId: outbox.broadcasts[0]?.id });
		expect(outbox.createCalls).toBe(1);
	});

	it("a create that timed out after Resend made the broadcast is found, not repeated, on retry", async () => {
		const { deps, outbox, mailer: real } = world();
		let timeouts = 1;
		const flaky: Mailer = {
			...real,
			async createBroadcast(draft) {
				const created = await real.createBroadcast(draft);
				return timeouts-- > 0
					? err({ kind: "unavailable", status: null, message: "timed out" })
					: created;
			},
		};
		const flakyDeps = { ...deps, mailer: flaky };
		const issue = await tested(flakyDeps);
		const input = { id: issue.id, revision: issue.revision, sendAt: null };
		expect(await approve(flakyDeps, input)).toMatchObject({
			ok: false,
			error: { code: "mail-unavailable" },
		});
		expect(value(await approve(flakyDeps, input)).status).toBe("sent");
		expect(outbox.createCalls).toBe(1);
	});

	it("a refused create returns the issue to a tested draft that can be approved again", async () => {
		const { deps, outbox, mailer: real } = world();
		let refusals = 1;
		const strict: Mailer = {
			...real,
			async createBroadcast(draft) {
				if (refusals-- > 0) return err({ kind: "rejected", status: 422, message: "bad from" });
				return real.createBroadcast(draft);
			},
		};
		const strictDeps = { ...deps, mailer: strict };
		const issue = await tested(strictDeps);
		const input = { id: issue.id, revision: issue.revision, sendAt: null };
		expect(await approve(strictDeps, input)).toMatchObject({
			ok: false,
			error: { code: "mail-rejected" },
		});
		expect(value(await approve(strictDeps, input)).status).toBe("sent");
		expect(outbox.broadcasts).toHaveLength(1);
	});

	it("a broadcast left as a Resend draft is sent, not created again", async () => {
		const { deps, outbox, mailer } = world();
		const issue = await tested(deps);
		const key = `fm-issue:${issue.id}:rev:${issue.revision}`;
		const draftFinder: Mailer = {
			...mailer,
			findBroadcast: async (name) =>
				name === key ? ok({ id: "resend-draft-1", status: "draft" }) : ok(null),
		};
		const sent = value(
			await approve(
				{ ...deps, mailer: draftFinder },
				{ id: issue.id, revision: issue.revision, sendAt: null },
			),
		);
		expect(sent.broadcastId).toBe("resend-draft-1");
		expect(outbox.createCalls).toBe(0);
	});
});

describe("event lists are re-read at approve time (R13)", () => {
	it("refuses an approval whose events changed, updates them and asks for a new test", async () => {
		const { deps, outbox, events } = world();
		const issue = await tested(deps);
		events.push(
			series({
				id: entryId(99),
				body: LODGE,
				title: "Table Lodge",
				timing: timed("2027-05-01T18:00", "2027-05-01T21:00"),
			}),
		);
		const refused = await approve(deps, { id: issue.id, revision: issue.revision, sendAt: null });
		expect(refused).toMatchObject({ ok: false, error: { code: "events-changed" } });
		expect(outbox.createCalls).toBe(0);

		const reloaded = value(await newIssue(deps));
		expect(reloaded.revision).toBe(issue.revision + 1);
		expect(reloaded.composed).toBe(false);
		expect(JSON.stringify(reloaded.doc)).toContain("Table Lodge");

		const retested = value(
			await testSend(deps, { id: reloaded.id, revision: (await saved(deps, reloaded)).revision }),
		);
		expect(
			value(await approve(deps, { id: retested.id, revision: retested.revision, sendAt: null }))
				.status,
		).toBe("sent");
	});
});

describe("the public archive (FR-6.8)", () => {
	it("shows a sent issue's subject, date, slug and sent email, and nothing of a draft", async () => {
		const { deps, rows } = world();
		const issue = await tested(deps);
		expect(await publishedIssues(deps.store, NOW)).toEqual([]);

		await approve(deps, { id: issue.id, revision: issue.revision, sendAt: null });
		const published = await publishedIssues(deps.store, NOW);
		expect(published).toEqual([
			{
				slug: "2027-04-15-findlay-masonic-newsletter-apr-15-2027",
				subject: issue.subject,
				sentAt: NOW.toString(),
				html: expect.stringContaining("Brethren,"),
			},
		]);
		const stored = await rows.getVersioned(issue.id);
		expect(JSON.stringify(stored?.value)).toContain(JSON.stringify(published[0]?.html));
	});

	it("holds a scheduled issue back until its send time", async () => {
		const { deps } = world();
		const issue = await tested(deps);
		const sendAt = instant("2027-04-20T13:00:00Z");
		await approve(deps, { id: issue.id, revision: issue.revision, sendAt });
		expect(await publishedIssues(deps.store, NOW)).toEqual([]);
		const due = await publishedIssues(deps.store, sendAt);
		expect(due.map((entry) => entry.sentAt)).toEqual([sendAt.toString()]);
	});
});
