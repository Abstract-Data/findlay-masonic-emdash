import { emptyOutbox, fakeMailer } from "@adapters/dev-fakes";
import type { Mailer } from "@adapters/resend-mailer";
import { err } from "@core/ids";
import { transport } from "@plugins/newsletter/transport";
import type { EmailDeliverEvent } from "emdash";
import { describe, expect, it } from "vitest";

const FROM = "Findlay Masonic Temple <noreply@example.test>";

function event(message: EmailDeliverEvent["message"]): EmailDeliverEvent {
	return { message, source: "system", userAgent: null, referer: null, geo: null };
}

describe("email:deliver transport (FR-8.1)", () => {
	it("delivers EmDash's email through Resend with its cc and reply-to", async () => {
		const outbox = emptyOutbox();
		const deliver = transport(async () => ({ mailer: fakeMailer(outbox), from: FROM }));
		await deliver(
			event({
				to: "new.editor@example.test",
				cc: ["secretary@example.test"],
				replyTo: "admin@example.test",
				subject: "You are invited",
				text: "Accept the invite",
				html: "<p>Accept the invite</p>",
			}),
		);
		expect(outbox.emails).toEqual([
			{
				from: FROM,
				to: ["new.editor@example.test"],
				cc: ["secretary@example.test"],
				replyTo: "admin@example.test",
				subject: "You are invited",
				text: "Accept the invite",
				html: "<p>Accept the invite</p>",
			},
		]);
	});

	it("sends a plain email with neither cc nor reply-to", async () => {
		const outbox = emptyOutbox();
		await transport(async () => ({ mailer: fakeMailer(outbox), from: FROM }))(
			event({ to: "a@example.test", subject: "Sign in", text: "Link" }),
		);
		expect(outbox.emails).toEqual([
			{ from: FROM, to: ["a@example.test"], subject: "Sign in", text: "Link" },
		]);
	});

	it("fails the delivery when Resend is not configured or refuses the email", async () => {
		const refusing: Mailer = {
			...fakeMailer(emptyOutbox()),
			sendEmail: async () => err({ kind: "rejected", status: 403, message: "domain not verified" }),
		};
		const message = event({ to: "a@example.test", subject: "Sign in", text: "Link" });
		await expect(transport(async () => ({ mailer: null, from: FROM }))(message)).rejects.toThrow(
			"RESEND_API_KEY",
		);
		await expect(
			transport(async () => ({ mailer: refusing, from: FROM }))(message),
		).rejects.toThrow("domain not verified");
	});
});
