import { log } from "@adapters/log";
import { chooseProvider, deliversEmail } from "@adapters/providers";
import { resendMailer, type Mailer } from "@adapters/resend-mailer";
import { gateOutbound, parseSiteEnv } from "@adapters/send-gate";
import { siteverify, type TurnstileVerifier } from "@adapters/turnstile";
import {
	NEWSLETTER_TEST_ALLOWLIST,
	RESEND_API_KEY,
	RESEND_FAKE,
	RESEND_FROM,
	RESEND_NEWSLETTER_TOPIC_ID,
	RESEND_SEGMENT_ID,
	SITE_ENV,
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

/** The settings a deployed Worker reads from its env (`astro:env`, access "secret"). */
export interface Settings {
	readonly resendApiKey: string | undefined;
	readonly resendFrom: string | undefined;
	readonly segmentId: string | undefined;
	readonly topicId: string | undefined;
	readonly testAllowlist: string | undefined;
	readonly turnstileSecret: string | undefined;
	readonly siteEnv: string | undefined;
}

/**
 * The real Resend and Turnstile clients the settings allow; null where one is not configured.
 * Outside production, Resend reaches only the allowlist (src/lib/adapters/send-gate.ts).
 */
export function realRuntime(settings: Settings): Runtime {
	const config: NewsletterConfig = {
		from: blank(settings.resendFrom),
		segmentId: blank(settings.segmentId),
		topicId: blank(settings.topicId),
		testAllowlist: parseAllowlist(settings.testAllowlist ?? ""),
	};
	const key = blank(settings.resendApiKey);
	const secret = blank(settings.turnstileSecret);
	return {
		mailer:
			key === null
				? null
				: gateOutbound(resendMailer(key), {
						env: parseSiteEnv(settings.siteEnv),
						allowlist: config.testAllowlist,
						onBlocked: (email, blocked) =>
							log({
								event: "email.blocked",
								siteEnv: settings.siteEnv ?? "unset",
								recipients: email.to.length + (email.cc?.length ?? 0),
								blocked,
							}),
					}),
		verifier: secret === null ? null : siteverify(secret),
		config,
	};
}

/**
 * The Resend and Turnstile clients for this request. `import.meta.env.DEV` is false in every
 * build, so the fakes (and their module) exist only under `astro dev`.
 */
export async function runtime(): Promise<Runtime> {
	const real = realRuntime({
		resendApiKey: RESEND_API_KEY,
		resendFrom: RESEND_FROM,
		segmentId: RESEND_SEGMENT_ID,
		topicId: RESEND_NEWSLETTER_TOPIC_ID,
		testAllowlist: NEWSLETTER_TEST_ALLOWLIST,
		turnstileSecret: TURNSTILE_SECRET,
		siteEnv: SITE_ENV,
	});
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
	if (!import.meta.env.DEV || (mail !== "fake" && captcha !== "fake")) return real;
	const fakes = await import("@adapters/dev-fakes");
	return {
		mailer: mail === "fake" ? fakes.fakeMailer() : real.mailer,
		verifier: captcha === "fake" ? fakes.dummyVerifier : real.verifier,
		config: mail === "fake" ? fakes.withFakeConfig(real.config) : real.config,
	};
}
