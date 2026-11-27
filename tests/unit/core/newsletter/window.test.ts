import { issueWindow } from "@core/newsletter/window";
import { describe, expect, it } from "vitest";
import { instant, issueId } from "../../fixtures";

describe("issueWindow (FR-6.1)", () => {
	it("covers the 90 local calendar days before now for the first issue", () => {
		const now = instant("2027-04-15T14:00:00Z");
		expect(issueWindow(null, now)).toEqual({
			kind: "first",
			from: instant("2027-01-15T15:00:00Z"),
			to: now,
		});
	});

	it("starts a later issue where the last issue's coverage ended", () => {
		const now = instant("2027-07-01T14:00:00Z");
		const last = { id: issueId(7), coverageEnd: instant("2027-04-15T14:00:00Z") };
		expect(issueWindow(last, now)).toEqual({
			kind: "since-last",
			from: last.coverageEnd,
			to: now,
			previous: last.id,
		});
	});
});
