import type { Temporal } from "temporal-polyfill";
import type { IssueId } from "../ids";
import { SITE_TZ } from "../time";

export type IssueWindow =
	| { readonly kind: "first"; readonly from: Temporal.Instant; readonly to: Temporal.Instant }
	| {
			readonly kind: "since-last";
			readonly from: Temporal.Instant;
			readonly to: Temporal.Instant;
			readonly previous: IssueId;
	  };

const FIRST_ISSUE_DAYS = 90;

/**
 * FR-6.1. A later issue starts where the last scheduled or sent issue's coverage ended
 * (its stored window `to`), not at its send time, so news published between assembly
 * and send is neither lost nor repeated.
 */
export function issueWindow(
	last: { readonly id: IssueId; readonly coverageEnd: Temporal.Instant } | null,
	now: Temporal.Instant,
): IssueWindow {
	if (last === null) {
		const from = now.toZonedDateTimeISO(SITE_TZ).subtract({ days: FIRST_ISSUE_DAYS }).toInstant();
		return { kind: "first", from, to: now };
	}
	return { kind: "since-last", from: last.coverageEnd, to: now, previous: last.id };
}
