import { actorStore, type RequestActor } from "@adapters/emdash/actor-context";
import { guardRequest } from "@adapters/emdash/request-guard";
import { defineMiddleware } from "astro:middleware";

// EmDash's own middleware is ordered "pre", so locals.user is already the signed-in user here.
export const onRequest = defineMiddleware(async (context, next) => {
	const user = context.locals.user;
	const actor: RequestActor | null = user ? { id: user.id, role: user.role } : null;
	const denied = await guardRequest({
		routePattern: context.routePattern,
		method: context.request.method,
		params: context.params,
		locale: context.url.searchParams.get("locale") ?? undefined,
		actor,
		emdash: context.locals.emdash,
	});
	return denied ?? actorStore.run(actor, next);
});
