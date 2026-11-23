export type ProviderChoice = "real" | "fake" | "unconfigured";

export interface ProviderInput {
	/** `import.meta.env.DEV`: true only in `astro dev`, false in every build. */
	readonly dev: boolean;
	/** RESEND_FAKE: ask for the fake even when a key is set. */
	readonly fakeRequested: boolean;
	readonly secret: string | undefined;
}

/**
 * Which Resend or Turnstile client a request gets. A dev server without a key behaves like
 * EmDash's dev console email and uses the fake; a build never does, whatever the flags say.
 */
export function chooseProvider(input: ProviderInput): ProviderChoice {
	const hasSecret = input.secret !== undefined && input.secret.trim() !== "";
	if (input.dev && (input.fakeRequested || !hasSecret)) return "fake";
	return hasSecret ? "real" : "unconfigured";
}

/**
 * Whether the plugin should be EmDash's email provider. Until Resend can send, it stays out of
 * the way, so EmDash keeps showing invite links for an Admin to share instead of failing.
 */
export function deliversEmail(
	input: ProviderInput & { readonly from: string | undefined },
): boolean {
	const choice = chooseProvider(input);
	const hasFrom = input.from !== undefined && input.from.trim() !== "";
	return choice === "fake" || (choice === "real" && hasFrom);
}
