import { actorStore, type RequestActor } from "@adapters/emdash/actor-context";
import { emdashReads, guardRequest, refusalResponse } from "@adapters/emdash/request-guard";
import { log } from "@adapters/log";
import { privateResponse } from "@adapters/site/cache";
import { defineMiddleware } from "astro:middleware";

/** The Astro session cookie EmDash signs users in with (its `sessionCookieName` default). */
const SESSION_COOKIE = "astro-session";

// EmDash's own middleware is ordered "pre", so locals.user is already the signed-in user here.
export const onRequest = defineMiddleware(async (context, next) => {
	const { user, emdash } = context.locals;
	const actor: RequestActor | null = user ? { id: user.id, role: user.role } : null;
	const method = context.request.method;
	const refusal =
		emdash === undefined
			? null
			: await guardRequest(
					{
						routePattern: context.routePattern,
						method,
						params: context.params,
						locale: context.url.searchParams.get("locale") ?? undefined,
						actor,
						body: async (): Promise<unknown> =>
							context.request
								.clone()
								.json()
								.catch(() => null),
					},
					() => emdashReads(emdash),
				);
	if (refusal !== null) {
		log({
			event: "body_access.refused",
			code: refusal.code,
			source: "middleware",
			user: actor?.id ?? null,
			route: context.routePattern,
			method,
			reason: refusal.message,
		});
		return refusalResponse(refusal);
	}
	const response = await actorStore.run(actor, next);
	// The edge cache serves a stored page without running the Worker, so a page rendered for a
	// signed-in user, for a request with credentials (Cloudflare stores the answer to one that
	// carries Authorization when it says `public`), or one that sets a cookie, must never be
	// stored: a visitor would get it. Opting out after the page ran overrides whatever the page
	// asked for; src/worker.ts checks the finished response again.
	const personal =
		actor !== null ||
		context.cookies.has(SESSION_COOKIE) ||
		context.request.headers.has("authorization") ||
		!context.cookies.headers().next().done ||
		(method !== "GET" && method !== "HEAD");
	if (!personal) return response;
	if (context.cache.enabled) context.cache.set(false);
	return privateResponse(response);
});
