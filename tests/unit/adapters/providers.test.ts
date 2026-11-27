import { chooseProvider, deliversEmail } from "@adapters/providers";
import { describe, expect, it } from "vitest";

describe("the plugin becomes EmDash's email provider only when Resend can send", () => {
	const FROM = "Findlay Masonic Temple <noreply@example.test>";

	it("stays out of a build without a key or sender, so invites fall back to a shared link", () => {
		expect(deliversEmail({ dev: false, fakeRequested: true, secret: undefined, from: FROM })).toBe(
			false,
		);
		expect(
			deliversEmail({ dev: false, fakeRequested: false, secret: "re_live_key", from: " " }),
		).toBe(false);
		expect(
			deliversEmail({ dev: false, fakeRequested: false, secret: "re_live_key", from: FROM }),
		).toBe(true);
	});

	it("delivers through the fake on the dev server", () => {
		expect(
			deliversEmail({ dev: true, fakeRequested: false, secret: undefined, from: undefined }),
		).toBe(true);
	});
});

const SECRETS = [undefined, "", "   ", "re_live_key"] as const;
const FLAGS = [false, true] as const;

describe("fake Resend and Turnstile never run outside the dev server", () => {
	it("a build never chooses the fake, whatever RESEND_FAKE and the keys say", () => {
		const choices = FLAGS.flatMap((fakeRequested) =>
			SECRETS.map((secret) => chooseProvider({ dev: false, fakeRequested, secret })),
		);
		expect(choices).not.toContain("fake");
		expect(choices).toEqual([
			"unconfigured",
			"unconfigured",
			"unconfigured",
			"real",
			"unconfigured",
			"unconfigured",
			"unconfigured",
			"real",
		]);
	});

	it("the dev server uses the fake without a key, or when RESEND_FAKE asks for it", () => {
		expect(chooseProvider({ dev: true, fakeRequested: false, secret: undefined })).toBe("fake");
		expect(chooseProvider({ dev: true, fakeRequested: true, secret: "re_live_key" })).toBe("fake");
		expect(chooseProvider({ dev: true, fakeRequested: false, secret: "re_live_key" })).toBe("real");
	});
});
