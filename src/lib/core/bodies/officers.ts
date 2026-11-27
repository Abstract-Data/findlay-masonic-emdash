import { TITLES_BY_BODY_TYPE, type BodyType } from "../acl/officer-titles";

export interface TermOfficer {
	readonly name: string;
	readonly title: string;
	readonly termYear: number;
	/** `display_order`, or null when the editor left it blank. */
	readonly order: number | null;
}

export interface Roster<T extends TermOfficer> {
	/** The term shown, or null when no term has begun yet. */
	readonly term: number | null;
	readonly officers: readonly T[];
}

/**
 * FR-2.2. A body's current term is the latest term year it has entered that has begun by
 * `year`: a term entered ahead of time waits for its year, and a body whose term began last
 * year (an autumn installation) keeps it until it enters the next one. Officers are in display
 * order; ones without it follow in the body type's conventional title order.
 */
export function currentRoster<T extends TermOfficer>(
	officers: readonly T[],
	year: number,
	bodyType: BodyType | null,
): Roster<T> {
	const begun = officers.map((o) => o.termYear).filter((termYear) => termYear <= year);
	if (begun.length === 0) return { term: null, officers: [] };
	const term = Math.max(...begun);
	const titles: readonly string[] = bodyType === null ? [] : TITLES_BY_BODY_TYPE[bodyType];
	const rank = (title: string) => {
		const index = titles.indexOf(title);
		return index === -1 ? titles.length : index;
	};
	const unordered = Number.MAX_SAFE_INTEGER;
	return {
		term,
		officers: officers
			.filter((o) => o.termYear === term)
			.toSorted(
				(a, b) =>
					(a.order ?? unordered) - (b.order ?? unordered) ||
					rank(a.title) - rank(b.title) ||
					a.name.localeCompare(b.name, "en"),
			),
	};
}
