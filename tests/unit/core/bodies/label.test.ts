import { displayName, shortLabel } from "@core/bodies/label";
import { describe, expect, it } from "vitest";

describe("body names", () => {
	it("adds the number to the full name", () => {
		expect(displayName("Findlay Lodge", 227)).toBe("Findlay Lodge No. 227");
		expect(displayName("Findlay Temple Board", null)).toBe("Findlay Temple Board");
	});

	it.each([
		["Blue Lodge", "Findlay Lodge", 227, "Lodge 227"],
		["Chapter", "Findlay Chapter", 58, "Chapter 58"],
		["Council", "Findlay Council", 50, "Council 50"],
		["Commandery", "Findlay Commandery", 49, "Commandery 49"],
		[
			"Order of the Eastern Star",
			"Findlay Chapter, Order of the Eastern Star",
			23,
			"Eastern Star 23",
		],
		["Temple Board", "Findlay Temple Board", null, "Temple Board"],
	] as const)(
		"labels a %s as %s on calendars and news (FR-3.4, FR-4.4)",
		(type, name, number, label) => {
			expect(shortLabel(type, name, number)).toBe(label);
		},
	);

	it("falls back to the full name for a body without a type", () => {
		expect(shortLabel(null, "Findlay Lodge", 227)).toBe("Findlay Lodge No. 227");
	});
});
