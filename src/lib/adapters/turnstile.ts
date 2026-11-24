export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The form field the Turnstile widget fills with its token. */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/** The token Cloudflare's test site keys issue; its test secret keys accept only this. */
export const DUMMY_TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

const MAX_TOKEN_LENGTH = 2048;
const TIMEOUT_MS = 10_000;

export type TurnstileVerdict =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly reason: "missing-token" | "rejected" | "unavailable";
			readonly codes: readonly string[];
	  };

/** Each form's widget `data-action`, which siteverify echoes back with the token. */
export const TURNSTILE_ACTION = { subscribe: "subscribe", contact: "contact" } as const;

/** The hostnames of the origins a form may post from. */
export function hostnamesOf(origins: readonly string[]): string[] {
	return origins.flatMap((origin) => (URL.canParse(origin) ? [new URL(origin).hostname] : []));
}

/** Where a token must have been solved: the widget's `data-action` on one of these hostnames. */
export interface TurnstileForm {
	readonly hostnames: readonly string[];
	readonly action: string;
}

export interface TurnstileVerifier {
	verify(
		token: string | null,
		remoteIp: string | null,
		form: TurnstileForm,
	): Promise<TurnstileVerdict>;
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Server-side token check with Cloudflare's siteverify endpoint (spec Q7). A token also has to
 * come from this site's widget for this form: one solved on another site using the same widget,
 * or in the other form, is refused. Cloudflare's test secret keys answer `example.com` and no
 * action, so they pass nothing; the dev server uses its offline stand-in instead.
 */
export function siteverify(secret: string, fetchFn: Fetch = fetch): TurnstileVerifier {
	return {
		async verify(token, remoteIp, form) {
			if (token === null || token === "" || token.length > MAX_TOKEN_LENGTH) {
				return { ok: false, reason: "missing-token", codes: [] };
			}
			const body = new URLSearchParams({ secret, response: token });
			if (remoteIp !== null) body.set("remoteip", remoteIp);
			let outcome: unknown;
			try {
				const response = await fetchFn(SITEVERIFY_URL, {
					method: "POST",
					body,
					signal: AbortSignal.timeout(TIMEOUT_MS),
				});
				outcome = await response.json();
			} catch {
				return { ok: false, reason: "unavailable", codes: [] };
			}
			if (typeof outcome !== "object" || outcome === null) {
				return { ok: false, reason: "unavailable", codes: [] };
			}
			if (Reflect.get(outcome, "success") === true) {
				const hostname: unknown = Reflect.get(outcome, "hostname");
				if (typeof hostname !== "string" || !form.hostnames.includes(hostname)) {
					return { ok: false, reason: "rejected", codes: ["hostname-mismatch"] };
				}
				if (Reflect.get(outcome, "action") !== form.action) {
					return { ok: false, reason: "rejected", codes: ["action-mismatch"] };
				}
				return { ok: true };
			}
			const codes: unknown = Reflect.get(outcome, "error-codes");
			const list = Array.isArray(codes)
				? codes.filter((code): code is string => typeof code === "string")
				: [];
			// Cloudflare's own failure is not the visitor's; ask them to retry rather than refuse.
			return list.includes("internal-error")
				? { ok: false, reason: "unavailable", codes: list }
				: { ok: false, reason: "rejected", codes: list };
		},
	};
}
