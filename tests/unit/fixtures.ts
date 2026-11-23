// Fixtures stand in for the parse boundary, so they mint brands with assertions.
/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { Editor } from "@core/acl/policy";
import type { AbsoluteUrl, BodyId, EntryId, IssueId, TagSlug, UserId } from "@core/ids";
import { Temporal } from "temporal-polyfill";

/** Fake ULIDs: valid Crockford base32, readable in failure output. */
const ulid = (prefix: string, n: number) => `01J${prefix}${String(n).padStart(22, "0")}`;

export const bodyId = (n: number) => ulid("B", n) as BodyId;
export const entryId = (n: number) => ulid("E", n) as EntryId;
export const issueId = (n: number) => ulid("N", n) as IssueId;
export const userId = (name: string) => name as UserId;
export const tag = (slug: string) => slug as TagSlug;
export const url = (href: string) => href as AbsoluteUrl;

export const LODGE = bodyId(1);
export const CHAPTER = bodyId(2);

export function editor(id: string, grants: readonly BodyId[] = [], isAdmin = false): Editor {
	return { id: userId(id), isAdmin, grants: new Set(grants) };
}

export const instant = (iso: string) => Temporal.Instant.from(iso);
export const date = (iso: string) => Temporal.PlainDate.from(iso);
