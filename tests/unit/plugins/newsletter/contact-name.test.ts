import { dummyVerifier } from "@adapters/dev-fakes";
import { TURNSTILE_FIELD } from "@adapters/turnstile";
import { contact, type ContactDeps } from "@plugins/newsletter/contact";
import type { EmailMessage } from "emdash";
import { describe, expect, it } from "vitest";

// M4 verification N5: the visitor's name is the one field a sender controls that reaches the
// recipient's reading of who wrote, so it must not pose as an address or reorder the text.
async function send(name: string): Promise<{ outcome: string; email: EmailMessage | undefined }> {
	const sent: EmailMessage[] = [];
	const deps: ContactDeps = {
		verifier: dummyVerifier,
		send: async (message) => {
			sent.push(message);
		},
		body: async () => ({ name: "Findlay Lodge No. 227", recipients: ["secretary@example.test"] }),
		limiter: { allow: async () => ({ ok: true }) },
		siteName: "Findlay Masonic Temple",
	};
	const fields = {
		body: "lodge",
		name,
		email: "visitor@example.test",
		message: "When do you meet?",
		[TURNSTILE_FIELD]: "XXXX.DUMMY.TOKEN.XXXX",
	};
	const outcome = await contact(deps, {
		remoteIp: "203.0.113.9",
		siteOrigins: ["https://findlaymason.org"],
		fields: Object.entries(fields).map(([field, value]) => ({ name: field, value })),
	});
	return { outcome, email: sent[0] };
}

const c = (...points: number[]) => String.fromCodePoint(...points);
const RLO = c(0x20_2e);
const LS = c(0x20_28);
const PS = c(0x20_29);
const UNSAFE = new RegExp(
	`[<>${c(0x20_2a)}-${RLO}${c(0x20_66)}-${c(0x20_69, 0x20_0e, 0x20_0f)}${LS}${PS}]`,
	"u",
);

describe("the contact form's sender name (M4 verification N5)", () => {
	it.each([
		["angle brackets", "Grand Master <gm@findlaymason.org>", "Grand Master gm@findlaymason.org"],
		["a right-to-left override", `Jane${RLO}gro.nosam@mg`, "Janegro.nosam@mg"],
		["a line separator", `Jane${LS}Bcc: x@example.test`, "Jane Bcc: x@example.test"],
		["a paragraph separator", `Jane${PS}Visitor`, "Jane Visitor"],
		[
			"isolates and marks",
			`${c(0x20_66)}Jane${c(0x20_69)} ${c(0x20_0f)}Visitor${c(0x20_0e)}`,
			"Jane Visitor",
		],
	])("strips %s from the name", async (_, raw, clean) => {
		const { outcome, email } = await send(raw);
		expect(outcome).toBe("sent");
		expect(email?.text).toContain(`Name, as the visitor typed it: "${clean}"`);
		expect(email?.text).not.toMatch(UNSAFE);
	});

	it("keeps the name out of the subject, so it cannot pose as the site or another sender", async () => {
		const { email } = await send("Findlay Masonic Temple Admin");
		expect(email?.subject).toBe("Website message for Findlay Lodge No. 227");
	});

	it("refuses a name that is nothing but stripped characters", async () => {
		expect((await send(`<${RLO}>`)).outcome).toBe("invalid");
	});
});
