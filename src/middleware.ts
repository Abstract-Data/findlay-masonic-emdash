import { actorStore, type RequestActor } from "@adapters/emdash/actor-context";
import { emdashReads, guardRequest, refusalResponse } from "@adapters/emdash/request-guard";
import { log } from "@adapters/log";
import { defineMiddleware } from "astro:middleware";

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
	if (refusal === null) return actorStore.run(actor, next);
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
});
