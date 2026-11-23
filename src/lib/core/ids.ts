declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type BodyId = Brand<string, "BodyId">;
export type UserId = Brand<string, "UserId">;
export type EntryId = Brand<string, "EntryId">;
export type IssueId = Brand<string, "IssueId">;
export type TagSlug = Brand<string, "TagSlug">;
export type AbsoluteUrl = Brand<string, "AbsoluteUrl">;

export type Result<T, E> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}
