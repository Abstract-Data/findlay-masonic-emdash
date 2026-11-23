import { currentRoster, type TermOfficer } from "@core/bodies/officers";
import { describe, expect, it } from "vitest";

const officer = (
	name: string,
	termYear: number,
	title = "Trustee",
	order: number | null = null,
): TermOfficer => ({ name, title, termYear, order });

const names = (officers: readonly TermOfficer[]) => officers.map((o) => o.name);

describe("currentRoster (FR-2.2)", () => {
	it("shows only the current term's officers, leaving past and future terms out", () => {
		const roster = currentRoster(
			[officer("Past", 2025), officer("Current", 2026), officer("Elected", 2027)],
			2026,
			"Temple Board",
		);
		expect(roster.term).toBe(2026);
		expect(names(roster.officers)).toEqual(["Current"]);
	});

	it("keeps a term that began last year until the body enters the next one", () => {
		const roster = currentRoster([officer("Installed in October", 2026)], 2027, "Temple Board");
		expect(roster.term).toBe(2026);
		expect(names(roster.officers)).toEqual(["Installed in October"]);
	});

	it("has no term when only a future term is entered", () => {
		expect(currentRoster([officer("Elected", 2027)], 2026, "Temple Board")).toEqual({
			term: null,
			officers: [],
		});
		expect(currentRoster([], 2026, null)).toEqual({ term: null, officers: [] });
	});

	it("orders by display order", () => {
		const roster = currentRoster(
			[officer("Third", 2026, "Trustee", 3), officer("First", 2026, "Trustee", 1)],
			2026,
			"Temple Board",
		);
		expect(names(roster.officers)).toEqual(["First", "Third"]);
	});

	it("puts officers without a display order after the rest, in the body type's title order", () => {
		const roster = currentRoster(
			[
				officer("Tyler", 2026, "Tyler"),
				officer("Unknown title", 2026, "Grand Poobah"),
				officer("Master", 2026, "Worshipful Master"),
				officer("Ordered", 2026, "Secretary", 1),
				officer("Warden", 2026, "Senior Warden"),
			],
			2026,
			"Blue Lodge",
		);
		expect(names(roster.officers)).toEqual([
			"Ordered",
			"Master",
			"Warden",
			"Tyler",
			"Unknown title",
		]);
	});

	it("breaks remaining ties by name, and needs no body type", () => {
		const roster = currentRoster([officer("Smith", 2026), officer("Adams", 2026)], 2026, null);
		expect(names(roster.officers)).toEqual(["Adams", "Smith"]);
	});
});
