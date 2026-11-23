import type { Temporal } from "temporal-polyfill";
import { err, ok, type IssueId, type Result } from "../ids";
import { broadcastKey, nextRevision, type BroadcastKey, type Revision } from "./key";
import type { IssueWindow } from "./window";

type DraftIssue = {
	readonly status: "draft";
	readonly id: IssueId;
	readonly revision: Revision;
	readonly testedRevision: Revision | null;
	readonly window: IssueWindow;
};

/** Persisted (compare-and-set on revision) before Resend is called; a retry looks up `key`. */
type CreatingIssue = {
	readonly status: "creating";
	readonly id: IssueId;
	readonly revision: Revision;
	readonly key: BroadcastKey;
	readonly sendAt: Temporal.Instant | null;
	readonly window: IssueWindow;
};

type BroadcastIssue = {
	readonly status: "scheduled" | "sent";
	readonly id: IssueId;
	readonly revision: Revision;
	readonly key: BroadcastKey;
	readonly broadcastId: string;
	readonly at: Temporal.Instant;
	readonly window: IssueWindow;
};

export type Issue = DraftIssue | CreatingIssue | BroadcastIssue;

export type IssueCommand =
	| { readonly kind: "edit" }
	| { readonly kind: "test-sent"; readonly revision: Revision }
	| { readonly kind: "approve"; readonly sendAt: Temporal.Instant | null }
	| {
			readonly kind: "broadcast-created";
			readonly broadcastId: string;
			readonly at: Temporal.Instant;
	  }
	| { readonly kind: "broadcast-failed" };

export type StepError = "not-tested-since-edit" | "not-draft" | "already-creating" | "not-creating";

/**
 * FR-6.5/6.6: an issue reaches Resend only after a test send of its current revision.
 * Any transition not listed is refused, so a new state or command fails closed.
 */
export function step(issue: Issue, command: IssueCommand): Result<Issue, StepError> {
	if (issue.status === "draft") return stepDraft(issue, command);
	if (issue.status === "creating") return stepCreating(issue, command);
	return err("not-draft");
}

function stepDraft(issue: DraftIssue, command: IssueCommand): Result<Issue, StepError> {
	switch (command.kind) {
		case "edit":
			return ok({ ...issue, revision: nextRevision(issue.revision) });
		case "test-sent":
			return ok({ ...issue, testedRevision: command.revision });
		case "approve":
			if (issue.testedRevision !== issue.revision) return err("not-tested-since-edit");
			return ok({
				status: "creating",
				id: issue.id,
				revision: issue.revision,
				key: broadcastKey(issue.id, issue.revision),
				sendAt: command.sendAt,
				window: issue.window,
			});
	}
	return err("not-creating");
}

function stepCreating(issue: CreatingIssue, command: IssueCommand): Result<Issue, StepError> {
	switch (command.kind) {
		case "broadcast-created":
			return ok({
				status: issue.sendAt === null ? "sent" : "scheduled",
				id: issue.id,
				revision: issue.revision,
				key: issue.key,
				broadcastId: command.broadcastId,
				at: command.at,
				window: issue.window,
			});
		case "broadcast-failed":
			return ok({
				status: "draft",
				id: issue.id,
				revision: issue.revision,
				testedRevision: issue.revision,
				window: issue.window,
			});
		case "approve":
			return err("already-creating");
	}
	return err("not-draft");
}
