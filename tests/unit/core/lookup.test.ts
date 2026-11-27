import { ownEntry } from "@core/lookup";
import { describe, expect, it } from "vitest";

const MESSAGES = { ok: "Thank you.", invalid: "Enter a valid address." };

describe("ownEntry: a table looked up by a value from a URL (M7 review L3)", () => {
	it("finds the table's own keys", () => {
		expect(ownEntry(MESSAGES, "ok")).toBe("Thank you.");
		expect(ownEntry(MESSAGES, "invalid")).toBe("Enter a valid address.");
	});

	it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "", "OK"])(
		"finds nothing for %j",
		(key) => {
			expect(ownEntry(MESSAGES, key)).toBeUndefined();
		},
	);

	it("finds nothing for a missing parameter", () => {
		expect(ownEntry(MESSAGES, null)).toBeUndefined();
	});
});
