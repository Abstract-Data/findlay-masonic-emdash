import { TITLES_BY_BODY_TYPE } from "@core/acl/officer-titles";
import { BODY_COLOURS, COLOUR_KEY, DEFAULT_COLOUR, bodyColour } from "@core/bodies/colour";
import { describe, expect, it } from "vitest";

describe("bodyColour (FR-4.4)", () => {
	it("is the colour an editor chose, whatever the body type", () => {
		expect(bodyColour("Red", "Commandery")).toBe("Red");
		expect(bodyColour("Green", null)).toBe("Green");
	});

	it("falls back to the body type's colour when none or an unknown one is stored", () => {
		expect(bodyColour(undefined, "Blue Lodge")).toBe("Blue");
		expect(bodyColour("", "Chapter")).toBe("Red");
		expect(bodyColour("blue", "Council")).toBe("Purple");
		expect(bodyColour("Teal", "Temple Board")).toBe("Brown");
	});

	it("is null for a body with neither", () => {
		expect(bodyColour(null, null)).toBeNull();
	});

	it("gives every body type its own colour, and every colour a key", () => {
		const types = Object.keys(TITLES_BY_BODY_TYPE);
		expect(Object.keys(DEFAULT_COLOUR).toSorted()).toEqual(types.toSorted());
		expect(new Set(Object.values(DEFAULT_COLOUR)).size).toBe(types.length);
		expect(Object.keys(COLOUR_KEY)).toEqual([...BODY_COLOURS]);
		expect(Object.values(COLOUR_KEY)).toEqual(BODY_COLOURS.map((c) => c.toLowerCase()));
	});
});
