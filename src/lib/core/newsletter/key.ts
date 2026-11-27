import type { Brand, IssueId } from "../ids";

/** A per-issue edit counter, not a content hash: the editor normalizes JSON on load. */
export type Revision = Brand<number, "Revision">;
export type BroadcastKey = Brand<string, "BroadcastKey">;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the counter starts here.
export const FIRST_REVISION = 1 as Revision;

export function nextRevision(revision: Revision): Revision {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- revisions only count up from FIRST_REVISION.
	return (revision + 1) as Revision;
}

/** FR-6.7: one key per issue revision, within Resend's 256-character limit for a ULID id. */
export function broadcastKey(id: IssueId, revision: Revision): BroadcastKey {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- this function is the key's only source.
	return `fm-issue:${id}:rev:${revision}` as BroadcastKey;
}
