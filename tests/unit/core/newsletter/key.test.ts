import { FIRST_REVISION, broadcastKey, nextRevision } from "@core/newsletter/key";
import { describe, expect, it } from "vitest";
import { issueId, revision } from "../../fixtures";

describe("broadcastKey (FR-6.7)", () => {
	it("derives the same key from the same issue and revision", () => {
		expect(broadcastKey(issueId(1), revision(3))).toBe(broadcastKey(issueId(1), revision(3)));
		expect(broadcastKey(issueId(1), revision(3))).toBe("fm-issue:01JN0000000000000000000001:rev:3");
	});

	it("changes with the revision and with the issue", () => {
		const key = broadcastKey(issueId(1), revision(3));
		expect(broadcastKey(issueId(1), nextRevision(revision(3)))).not.toBe(key);
		expect(broadcastKey(issueId(2), revision(3))).not.toBe(key);
	});

	it("stays within Resend's 256-character idempotency key limit", () => {
		expect(broadcastKey(issueId(1), revision(Number.MAX_SAFE_INTEGER)).length).toBeLessThanOrEqual(
			256,
		);
	});

	it("counts revisions up from the first", () => {
		expect(nextRevision(FIRST_REVISION)).toBe(2);
	});
});
