import { chooseProvider } from "@adapters/providers";
import { describe, expect, it } from "vitest";

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
