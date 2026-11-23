import { resendMailer } from "@adapters/resend-mailer";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Call {
	readonly method: string;
	readonly path: string;
	readonly body: unknown;
	readonly headers: Headers;
}

type Reply = { readonly status: number; readonly body: unknown } | "network-down";

/** Resend's HTTP API as the SDK sees it through fetch: records each request, answers from `reply`. */
function fakeResendApi(reply: (call: Call) => Reply): Call[] {
	const calls: Call[] = [];
	vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
		const url = new URL(input);
		expect(url.origin).toBe("https://api.resend.com");
		const call: Call = {
			method: init.method ?? "GET",
			path: url.pathname + url.search,
			body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
			headers: new Headers(init.headers),
		};
		calls.push(call);
		const answer = reply(call);
		if (answer === "network-down") throw new TypeError("fetch failed");
		return Response.json(answer.body, { status: answer.status });
	});
	return calls;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

const mailer = () => resendMailer("re_test_not_a_real_key");
const notFound = {
	status: 404,
	body: { name: "not_found", message: "Contact not found", statusCode: 404 },
};

const DRAFT = {
	name: "fm-issue:00000000-0000-4000-8000-000000000001:rev:3",
	segmentId: "seg-subscribers",
	topicId: "topic-newsletter",
	from: "Findlay Masonic Temple <news@example.test>",
	subject: "Spring news",
	previewText: "From all six bodies",
	html: "<html><body>Hi</body></html>",
	text: "Hi",
};

/** One broadcast create, as "ok" or "<kind>:<status>". */
async function createOnce(): Promise<string> {
	const sent = await mailer().createBroadcast({ ...DRAFT, scheduledAt: null });
	return sent.ok ? "ok" : `${sent.error.kind}:${sent.error.status}`;
}

describe("Resend mailer against a fake Resend API", () => {
	it("FR-8.1: sends an email with cc and reply-to, authorised by the key", async () => {
		const calls = fakeResendApi(() => ({ status: 200, body: { id: "email-1" } }));
		const sent = await mailer().sendEmail({
			from: "Temple <news@example.test>",
			to: ["secretary@example.test"],
			cc: ["treasurer@example.test"],
			replyTo: "lodge@example.test",
			subject: "Invite",
			html: "<p>Hi</p>",
			text: "Hi",
		});
		expect(sent).toEqual({ ok: true, value: { id: "email-1" } });
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			method: "POST",
			path: "/emails",
			body: {
				from: "Temple <news@example.test>",
				to: ["secretary@example.test"],
				cc: ["treasurer@example.test"],
				reply_to: "lodge@example.test",
				subject: "Invite",
				html: "<p>Hi</p>",
				text: "Hi",
			},
		});
		expect(calls[0]?.headers.get("Authorization")).toBe("Bearer re_test_not_a_real_key");
	});

	it("creates a broadcast to the Segment under the Topic, named and keyed by the issue key", async () => {
		const calls = fakeResendApi(() => ({ status: 200, body: { id: "broadcast-1" } }));
		const created = await mailer().createBroadcast({
			...DRAFT,
			scheduledAt: "2027-04-20T13:00:00Z",
		});
		expect(created).toEqual({ ok: true, value: { id: "broadcast-1" } });
		expect(calls[0]).toMatchObject({
			method: "POST",
			path: "/broadcasts",
			body: {
				name: DRAFT.name,
				segment_id: "seg-subscribers",
				topic_id: "topic-newsletter",
				from: DRAFT.from,
				subject: "Spring news",
				preview_text: "From all six bodies",
				html: DRAFT.html,
				text: "Hi",
				send: true,
				scheduled_at: "2027-04-20T13:00:00Z",
			},
		});
		expect(calls[0]?.headers.get("Idempotency-Key")).toBe(DRAFT.name);
	});

	it("sends a broadcast now when no time is given", async () => {
		const calls = fakeResendApi(() => ({ status: 200, body: { id: "broadcast-2" } }));
		await mailer().createBroadcast({ ...DRAFT, scheduledAt: null });
		expect(calls[0]?.body).toMatchObject({ send: true });
		expect(calls[0]?.body).not.toHaveProperty("scheduled_at");
	});

	it("finds a broadcast by name on a later page", async () => {
		const calls = fakeResendApi((call) =>
			call.path.includes("after=")
				? {
						status: 200,
						body: {
							object: "list",
							has_more: false,
							data: [{ id: "b-9", name: DRAFT.name, status: "queued" }],
						},
					}
				: {
						status: 200,
						body: {
							object: "list",
							has_more: true,
							data: [{ id: "b-1", name: "other", status: "sent" }],
						},
					},
		);
		expect(await mailer().findBroadcast(DRAFT.name)).toEqual({
			ok: true,
			value: { id: "b-9", status: "queued" },
		});
		expect(calls.map((call) => call.path)).toEqual([
			"/broadcasts?limit=100",
			"/broadcasts?limit=100&after=b-1",
		]);
	});

	it("answers null when no broadcast has the name", async () => {
		fakeResendApi(() => ({ status: 200, body: { object: "list", has_more: false, data: [] } }));
		expect(await mailer().findBroadcast(DRAFT.name)).toEqual({ ok: true, value: null });
	});

	it("FR-7.1: creates a new contact in the Segment with its Topics opted in", async () => {
		const calls = fakeResendApi((call) =>
			call.method === "GET" ? notFound : { status: 200, body: { object: "contact", id: "c-1" } },
		);
		const saved = await mailer().upsertContact({
			email: "new@example.test",
			segmentId: "seg-subscribers",
			topicIds: ["topic-newsletter", "topic-lodge"],
		});
		expect(saved).toEqual({ ok: true, value: undefined });
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"GET /contacts/new@example.test",
			"POST /contacts",
		]);
		expect(calls[1]?.body).toEqual({
			email: "new@example.test",
			segments: [{ id: "seg-subscribers" }],
			topics: [
				{ id: "topic-newsletter", subscription: "opt_in" },
				{ id: "topic-lodge", subscription: "opt_in" },
			],
		});
	});

	it("FR-7.1: adds an existing contact to the Segment and opts it in to the Topics", async () => {
		const calls = fakeResendApi((call) =>
			call.method === "GET"
				? { status: 200, body: { object: "contact", id: "c-1", email: "old@example.test" } }
				: { status: 200, body: { id: "c-1" } },
		);
		const saved = await mailer().upsertContact({
			email: "old@example.test",
			segmentId: "seg-subscribers",
			topicIds: ["topic-newsletter"],
		});
		expect(saved.ok).toBe(true);
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			"GET /contacts/old@example.test",
			"POST /contacts/old@example.test/segments/seg-subscribers",
			"PATCH /contacts/old@example.test/topics",
		]);
		expect(calls[2]?.body).toEqual([{ id: "topic-newsletter", subscription: "opt_in" }]);
	});

	it("reports a 4xx as rejected and a 5xx, 429 or network failure as an unknown outcome", async () => {
		const answers: Reply[] = [
			{ status: 422, body: { name: "validation_error", message: "Invalid from", statusCode: 422 } },
			{ status: 500, body: { name: "internal_server_error", message: "Oops", statusCode: 500 } },
			{ status: 429, body: { name: "rate_limit_exceeded", message: "Slow down", statusCode: 429 } },
			"network-down",
		];
		fakeResendApi(() => answers.shift() ?? "network-down");
		expect([
			await createOnce(),
			await createOnce(),
			await createOnce(),
			await createOnce(),
		]).toEqual(["rejected:422", "unavailable:500", "unavailable:429", "unavailable:null"]);
	});
});
