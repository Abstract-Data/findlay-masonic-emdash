import { log, record, scrub } from "@adapters/log";
import type { Mailer } from "@adapters/resend-mailer";
import { err } from "@core/ids";
import { realRuntime } from "@plugins/newsletter/runtime";
import { transport } from "@plugins/newsletter/transport";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A value with a real credential's prefix and length, assembled at run time from obviously fake
 * parts, so the scrubber meets the shape it must catch while no source line looks like a secret.
 */
function fakeSecret(prefix: string, length: number): string {
	return `${prefix}${"FAKE_0_TEST_".repeat(4)}`.slice(0, length);
}

const KEY = fakeSecret("re_", 36); // a Resend API key's shape
const TURNSTILE = fakeSecret(`0x4${"A".repeat(7)}`, 35); // a Turnstile secret key's shape
const BEARER = fakeSecret("ec_pat_", 42); // an EmDash personal access token's shape
const SECRETS = [KEY, TURNSTILE, BEARER];
const ADDRESSES = ["secretary@example.test", "visitor+news@example.org"];

/** Every line written to the console while `run` runs. */
async function lines(run: () => Promise<unknown>): Promise<string[]> {
	const written: string[] = [];
	for (const level of ["log", "info", "warn", "error", "debug"] as const) {
		vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
			written.push(args.map(String).join(" "));
		});
	}
	await run().catch(() => undefined);
	return written;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function leaks(written: readonly string[]): string[] {
	return [...SECRETS, ...ADDRESSES].filter((secret) =>
		written.some((line) => line.includes(secret)),
	);
}

describe("structured logs never carry secrets, email bodies or recipient addresses", () => {
	it("scrubs addresses and token-shaped runs from every string field", () => {
		const line = record({
			event: "body_access.lookup_failed",
			route: "/_emdash/api/content/[collection]/[id]",
			method: "PUT",
			user: "01JB0000000000000000000001",
			error: `D1 refused ${ADDRESSES[0]} with Authorization: Bearer ${BEARER} and ${KEY} ${TURNSTILE}`,
		});
		expect(leaks([JSON.stringify(line)])).toEqual([]);
		expect(JSON.stringify(line)).not.toMatch(/@example\.test|re_FAKE|0x4A{7}|ec_pat_/);
		expect(line).toMatchObject({
			level: "error",
			event: "body_access.lookup_failed",
			user: "01JB0000000000000000000001",
			error: "D1 refused [email] with Authorization: Bearer [redacted] and [redacted] [redacted]",
		});
	});

	it("keeps entry ids and issue ids readable", () => {
		expect(
			scrub("issue 6f1c2a9e-4b7d-4e2a-9c3f-1a2b3c4d5e6f entry 01JB0000000000000000000001"),
		).toBe("issue 6f1c2a9e-4b7d-4e2a-9c3f-1a2b3c4d5e6f entry 01JB0000000000000000000001");
	});

	it("writes one JSON object per event, at the event's level", async () => {
		const written = await lines(async () => {
			log({ event: "form.submitted", form: "contact", outcome: "sent" });
			log({ event: "form.rate_limited", form: "subscribe", limit: "target" });
		});
		expect(written.map((line) => JSON.parse(line))).toEqual([
			{ level: "info", event: "form.submitted", form: "contact", outcome: "sent" },
			{ level: "warn", event: "form.rate_limited", form: "subscribe", limit: "target" },
		]);
	});

	it("logs a failed delivery without its recipients, body or the API key", async () => {
		const failing: Mailer = {
			sendEmail: async () =>
				err({
					kind: "rejected",
					status: 422,
					message: `Invalid to field: ${ADDRESSES[0]} (key ${KEY})`,
				}),
			findBroadcast: async () => err({ kind: "unavailable", status: null, message: "" }),
			createBroadcast: async () => err({ kind: "unavailable", status: null, message: "" }),
			sendBroadcast: async () => err({ kind: "unavailable", status: null, message: "" }),
			upsertContact: async () => err({ kind: "unavailable", status: null, message: "" }),
			segmentContacts: async () => err({ kind: "unavailable", status: null, message: "" }),
			broadcastSegment: async () => err({ kind: "unavailable", status: null, message: "" }),
		};
		const deliver = transport(async () => ({ mailer: failing, from: "web@example.test" }));
		const written = await lines(async () =>
			deliver({
				message: {
					to: ADDRESSES[0] ?? "",
					cc: [ADDRESSES[1] ?? ""],
					subject: "Website message",
					text: "PRIVATE MESSAGE BODY",
				},
				source: "system",
			}),
		);
		expect(written).toHaveLength(1);
		expect(JSON.parse(written[0] ?? "")).toMatchObject({ event: "email.failed", status: 422 });
		expect(leaks(written)).toEqual([]);
		expect(written.join("")).not.toContain("PRIVATE MESSAGE BODY");
	});

	it("logs a blocked non-production email by count only", async () => {
		vi.stubGlobal("fetch", async () => Response.json({ id: "never" }));
		const { mailer } = realRuntime({
			resendApiKey: KEY,
			resendFrom: "web@example.test",
			segmentId: "seg",
			topicId: "topic",
			testAllowlist: "admin@example.test",
			turnstileSecret: TURNSTILE,
			siteEnv: "staging",
		});
		const written = await lines(async () =>
			mailer?.sendEmail({
				from: "web@example.test",
				to: [ADDRESSES[0] ?? ""],
				cc: [ADDRESSES[1] ?? ""],
				subject: "Invite",
				text: "PRIVATE MESSAGE BODY",
			}),
		);
		expect(written.map((line) => JSON.parse(line))).toEqual([
			{
				level: "warn",
				event: "email.blocked",
				siteEnv: "staging",
				action: "email",
				recipients: 2,
				blocked: 2,
			},
		]);
		expect(leaks(written)).toEqual([]);
	});

	it("logs a blocked non-production signup without the address", async () => {
		vi.stubGlobal("fetch", async () => Response.json({ id: "never" }));
		const { mailer } = realRuntime({
			resendApiKey: KEY,
			resendFrom: "web@example.test",
			segmentId: "seg",
			topicId: "topic",
			testAllowlist: "admin@example.test",
			turnstileSecret: TURNSTILE,
			siteEnv: "staging",
		});
		const written = await lines(async () =>
			mailer?.upsertContact({ email: ADDRESSES[0] ?? "", segmentId: "seg", topicIds: ["topic"] }),
		);
		expect(written.map((line) => JSON.parse(line))).toEqual([
			{
				level: "warn",
				event: "email.blocked",
				siteEnv: "staging",
				action: "signup",
				recipients: 1,
				blocked: 1,
			},
		]);
		expect(leaks(written)).toEqual([]);
	});
});
