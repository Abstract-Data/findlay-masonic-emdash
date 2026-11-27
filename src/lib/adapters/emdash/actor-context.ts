import { AsyncLocalStorage } from "node:async_hooks";

/** The signed-in user a request runs as, from the session EmDash's auth middleware resolved. */
export interface RequestActor {
	readonly id: string;
	readonly role: number;
}

// Dev SSR can load this module once for src/middleware.ts and again for the plugin, so the
// store lives on globalThis: the hooks must read the same store the middleware writes.
const KEY = Symbol.for("findlay-masonic:request-actor");

function sharedStore(): AsyncLocalStorage<RequestActor | null> {
	const existing: unknown = Reflect.get(globalThis, KEY);
	if (existing instanceof AsyncLocalStorage) return existing;
	const store = new AsyncLocalStorage<RequestActor | null>();
	Reflect.set(globalThis, KEY, store);
	return store;
}

/** Written by src/middleware.ts around each request; read by hooks whose event has no actor. */
export const actorStore = sharedStore();
