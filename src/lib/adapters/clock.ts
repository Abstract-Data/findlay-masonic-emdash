import { Temporal } from "temporal-polyfill";

/** Core never reads the time; callers pass `now` from a clock, which tests replace. */
export interface Clock {
	now(): Temporal.Instant;
}

export const systemClock: Clock = { now: () => Temporal.Now.instant() };

export function fixedClock(at: Temporal.Instant): Clock {
	return { now: () => at };
}
