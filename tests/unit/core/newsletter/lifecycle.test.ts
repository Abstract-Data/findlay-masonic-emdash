import { broadcastKey, FIRST_REVISION } from "@core/newsletter/key";
import { step, type Issue, type IssueCommand } from "@core/newsletter/lifecycle";
import type { IssueWindow } from "@core/newsletter/window";
import { describe, expect, it } from "vitest";
import { instant, issueId, revision } from "../../fixtures";

const window: IssueWindow = {
	kind: "first",
	from: instant("2027-01-15T15:00:00Z"),
	to: instant("2027-04-15T14:00:00Z"),
};
const id = issueId(1);
const sendAt = instant("2027-04-20T13:00:00Z");
const draft: Issue = {
	status: "draft",
	id,
	revision: FIRST_REVISION,
	testedRevision: null,
	window,
};

function run(issue: Issue, ...commands: IssueCommand[]) {
	let current = issue;
	for (const command of commands) {
		const result = step(current, command);
		if (!result.ok) return result;
		current = result.value;
	}
	return { ok: true as const, value: current };
}

describe("issue lifecycle (FR-6.5, 6.6, 6.7)", () => {
	it("refuses to approve an issue that was never test-sent (FR-6.6)", () => {
		expect(step(draft, { kind: "approve", sendAt: null })).toEqual({
			ok: false,
			error: "not-tested-since-edit",
		});
	});

	it("refuses to approve after an edit that followed the last test send (FR-6.6)", () => {
		expect(
			run(
				draft,
				{ kind: "test-sent", revision: FIRST_REVISION },
				{ kind: "edit" },
				{ kind: "approve", sendAt: null },
			),
		).toEqual({ ok: false, error: "not-tested-since-edit" });
	});

	it("refuses to approve when the test send was for an older revision", () => {
		expect(
			run(
				draft,
				{ kind: "edit" },
				{ kind: "test-sent", revision: FIRST_REVISION },
				{ kind: "approve", sendAt: null },
			),
		).toEqual({ ok: false, error: "not-tested-since-edit" });
	});

	it("moves a tested draft to creating with the key for its revision (FR-6.7)", () => {
		expect(
			run(
				draft,
				{ kind: "edit" },
				{ kind: "test-sent", revision: revision(2) },
				{ kind: "approve", sendAt },
			),
		).toEqual({
			ok: true,
			value: {
				status: "creating",
				id,
				revision: 2,
				key: broadcastKey(id, revision(2)),
				sendAt,
				window,
			},
		});
	});

	it("records a sent broadcast for an immediate send and a scheduled one otherwise (FR-6.5)", () => {
		const at = instant("2027-04-16T12:00:00Z");
		const tested = { kind: "test-sent", revision: FIRST_REVISION } as const;
		const created = { kind: "broadcast-created", broadcastId: "bc_123", at } as const;
		expect(run(draft, tested, { kind: "approve", sendAt: null }, created)).toEqual({
			ok: true,
			value: {
				status: "sent",
				id,
				revision: FIRST_REVISION,
				key: broadcastKey(id, FIRST_REVISION),
				broadcastId: "bc_123",
				at,
				window,
			},
		});
		expect(run(draft, tested, { kind: "approve", sendAt }, created)).toMatchObject({
			ok: true,
			value: { status: "scheduled", broadcastId: "bc_123" },
		});
	});

	it("returns a failed broadcast to a draft that can be approved again without a retest", () => {
		const failed = run(
			draft,
			{ kind: "test-sent", revision: FIRST_REVISION },
			{ kind: "approve", sendAt: null },
			{ kind: "broadcast-failed" },
		);
		expect(failed).toEqual({
			ok: true,
			value: {
				status: "draft",
				id,
				revision: FIRST_REVISION,
				testedRevision: FIRST_REVISION,
				window,
			},
		});
		expect(failed.ok && step(failed.value, { kind: "approve", sendAt: null }).ok).toBe(true);
	});

	it("refuses a second approval while a broadcast is being created", () => {
		const creating = run(
			draft,
			{ kind: "test-sent", revision: FIRST_REVISION },
			{ kind: "approve", sendAt: null },
		);
		expect(creating.ok && step(creating.value, { kind: "approve", sendAt: null })).toEqual({
			ok: false,
			error: "already-creating",
		});
	});

	it.each<IssueCommand>([{ kind: "edit" }, { kind: "test-sent", revision: FIRST_REVISION }])(
		"refuses $kind while a broadcast is being created",
		(command) => {
			const creating = run(
				draft,
				{ kind: "test-sent", revision: FIRST_REVISION },
				{ kind: "approve", sendAt: null },
			);
			expect(creating.ok && step(creating.value, command)).toEqual({
				ok: false,
				error: "not-draft",
			});
		},
	);

	it.each<IssueCommand>([
		{ kind: "broadcast-created", broadcastId: "bc_1", at: sendAt },
		{ kind: "broadcast-failed" },
	])("refuses $kind for a draft", (command) => {
		expect(step(draft, command)).toEqual({ ok: false, error: "not-creating" });
	});

	it.each<IssueCommand>([
		{ kind: "edit" },
		{ kind: "test-sent", revision: FIRST_REVISION },
		{ kind: "approve", sendAt: null },
		{ kind: "broadcast-created", broadcastId: "bc_2", at: sendAt },
		{ kind: "broadcast-failed" },
	])("refuses $kind once the issue is scheduled or sent", (command) => {
		for (const status of ["scheduled", "sent"] as const) {
			const done: Issue = {
				status,
				id,
				revision: FIRST_REVISION,
				key: broadcastKey(id, FIRST_REVISION),
				broadcastId: "bc_123",
				at: sendAt,
				window,
			};
			expect(step(done, command)).toEqual({ ok: false, error: "not-draft" });
		}
	});
});
