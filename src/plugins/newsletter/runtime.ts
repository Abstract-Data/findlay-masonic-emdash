import { chooseProvider, deliversEmail } from "@adapters/providers";
import { resendMailer, type Mailer } from "@adapters/resend-mailer";
import { siteverify, type TurnstileVerifier } from "@adapters/turnstile";
import {
	NEWSLETTER_TEST_ALLOWLIST,
	RESEND_API_KEY,
	RESEND_FAKE,
	RESEND_FROM,
	RESEND_NEWSLETTER_TOPIC_ID,
	RESEND_SEGMENT_ID,
	TURNSTILE_SECRET,
} from "astro:env/server";
import { parseAllowlist, type NewsletterConfig } from "./service";

export interface Runtime {
	readonly mailer: Mailer | null;
	readonly verifier: TurnstileVerifier | null;
	readonly config: NewsletterConfig;
}

const blank = (value: string | undefined) =>
	value === undefined || value.trim() === "" ? null : value;

/**
 * Read once, when EmDash builds its plugins: register the email transport or not. On Workers
 * that is during the first request of each isolate, after the Worker's env is bound (ADR-003).
 */
export function registersEmailTransport(): boolean {
	return deliversEmail({
		dev: import.meta.env.DEV,
		fakeRequested: RESEND_FAKE,
		secret: RESEND_API_KEY,
		from: RESEND_FROM,
	});
}

/**
 * The Resend and Turnstile clients for this request. `import.meta.env.DEV` is false in every
 * build, so the fakes (and their module) exist only under `astro dev`.
 */
export async function runtime(): Promise<Runtime> {
	const config: NewsletterConfig = {
		from: blank(RESEND_FROM),
		segmentId: blank(RESEND_SEGMENT_ID),
		topicId: blank(RESEND_NEWSLETTER_TOPIC_ID),
		testAllowlist: parseAllowlist(NEWSLETTER_TEST_ALLOWLIST ?? ""),
	};
	const mail = chooseProvider({
		dev: import.meta.env.DEV,
		fakeRequested: RESEND_FAKE,
		secret: RESEND_API_KEY,
	});
	const captcha = chooseProvider({
		dev: import.meta.env.DEV,
		fakeRequested: false,
		secret: TURNSTILE_SECRET,
	});
	const real: Runtime = {
		mailer: mail === "real" && RESEND_API_KEY !== undefined ? resendMailer(RESEND_API_KEY) : null,
		verifier:
			captcha === "real" && TURNSTILE_SECRET !== undefined ? siteverify(TURNSTILE_SECRET) : null,
		config,
	};
	if (!import.meta.env.DEV || (mail !== "fake" && captcha !== "fake")) return real;
	const fakes = await import("@adapters/dev-fakes");
	return {
		mailer: mail === "fake" ? fakes.fakeMailer() : real.mailer,
		verifier: captcha === "fake" ? fakes.dummyVerifier : real.verifier,
		config: mail === "fake" ? fakes.withFakeConfig(config) : config,
	};
}
