import { RRuleTemporal } from "rrule-temporal";
import { Temporal } from "temporal-polyfill";
import { err, ok, type Result } from "../ids";
import { SITE_TZ, toIcsDate, toIcsDateTime } from "../time";
import {
	seriesStart,
	type ByDay,
	type EventTiming,
	type Freq,
	type RRule,
	type RuleParts,
	type Weekday,
} from "./series";

export type RRuleError =
	| { readonly code: "syntax" }
	| { readonly code: "unsupported-part"; readonly part: string }
	| { readonly code: "unsupported-freq"; readonly freq: string }
	| { readonly code: "out-of-range"; readonly part: string; readonly value: string }
	| { readonly code: "count-and-until" }
	| { readonly code: "never-occurs" }
	| { readonly code: "dst-gap-time" }
	| { readonly code: "library-rejected"; readonly message: string };

const FREQS: ReadonlySet<string> = new Set<Freq>(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);
const isFreq = (value: string): value is Freq => FREQS.has(value);
const WEEKDAY = "(MO|TU|WE|TH|FR|SA|SU)";

// rrule-temporal's strict mode still accepts unknown parts and out-of-range numbers
// (GARBAGE=1, BYMONTHDAY=40, COUNT=-3), so every supported part is whitelisted here.
const PARTS: Partial<Record<string, { readonly item: RegExp; readonly list: boolean }>> = {
	INTERVAL: { item: /^[1-9]\d{0,3}$/, list: false },
	COUNT: { item: /^[1-9]\d{0,3}$/, list: false },
	UNTIL: { item: /^\d{8}(T\d{6}Z?)?$/, list: false },
	WKST: { item: new RegExp(`^${WEEKDAY}$`), list: false },
	BYDAY: { item: new RegExp(`^([+-]?[1-5])?${WEEKDAY}$`), list: true },
	BYMONTHDAY: { item: /^-?([1-9]|[12]\d|3[01])$/, list: true },
	BYMONTH: { item: /^([1-9]|1[0-2])$/, list: true },
	BYSETPOS: { item: /^-?[1-5]$/, list: true },
};

const NEVER_OCCURS_HORIZON = { years: 5 };

/**
 * FR-4.2. The charset check keeps the stored rule safe to emit verbatim into ICS:
 * no line breaks, colons or quotes can reach the feed.
 */
export function parseRRule(raw: string, timing: EventTiming): Result<RRule, RRuleError> {
	const text = raw
		.trim()
		.toUpperCase()
		.replace(/^RRULE:/, "");
	if (!/^[A-Z0-9=;,+-]+$/.test(text)) return err({ code: "syntax" });

	const parts = new Map<string, string>();
	for (const part of text.split(";")) {
		const eq = part.indexOf("=");
		const name = part.slice(0, eq);
		const value = part.slice(eq + 1);
		if (eq <= 0 || value === "" || parts.has(name)) return err({ code: "syntax" });
		parts.set(name, value);
	}

	for (const [name, value] of parts) {
		if (name === "FREQ") continue;
		const spec = PARTS[name];
		if (spec === undefined) return err({ code: "unsupported-part", part: name });
		const bad = (spec.list ? value.split(",") : [value]).find((item) => !spec.item.test(item));
		if (bad !== undefined) return err({ code: "out-of-range", part: name, value: bad });
	}

	const freq = parts.get("FREQ");
	if (freq === undefined) return err({ code: "syntax" });
	if (!isFreq(freq)) return err({ code: "unsupported-freq", freq });
	if (parts.has("COUNT") && parts.has("UNTIL")) return err({ code: "count-and-until" });
	// rrule-temporal silently drops occurrences that fall in the spring-forward gap.
	if (timing.kind === "timed" && timing.start.hour === 2) return err({ code: "dst-gap-time" });

	const rule = toRule(text, freq, parts);
	try {
		const start = seriesStart(timing);
		const found = compileRule(rule, timing, []).between(
			start,
			start.add(NEVER_OCCURS_HORIZON),
			true,
		);
		return found.length > 0 ? ok(rule) : err({ code: "never-occurs" });
	} catch (error) {
		return err({ code: "library-rejected", message: String(error) });
	}
}

const SUPPORTED_PARTS = ["FREQ", ...Object.keys(PARTS)].join(", ");

/** Plain text for an editor whose event save was refused. Parts and values are already charset-checked. */
export function rruleErrorText(error: RRuleError): string {
	switch (error.code) {
		case "syntax":
			return "The repeat rule is not valid. Write NAME=value pairs separated by semicolons, starting with FREQ, for example FREQ=MONTHLY;BYDAY=2TU.";
		case "unsupported-part":
			return `The repeat rule part ${error.part} is not supported. Use only ${SUPPORTED_PARTS}.`;
		case "unsupported-freq":
			return `The repeat frequency ${error.freq} is not supported. Use DAILY, WEEKLY, MONTHLY or YEARLY.`;
		case "out-of-range":
			return `The repeat rule value ${error.value} is not valid for ${error.part}.`;
		case "count-and-until":
			return "The repeat rule cannot have both COUNT and UNTIL. Keep one of them.";
		case "never-occurs":
			return "The repeat rule gives no meeting in the next five years. Check the start date and the rule.";
		case "dst-gap-time":
			return "A repeating event cannot start between 2:00 and 2:59 AM, because those times are skipped on the spring daylight-saving day. Choose another start time.";
	}
	return "The repeat rule cannot be read with this start date. If it has UNTIL, check that UNTIL matches the start date and time.";
}

function toRule(text: string, freq: Freq, parts: ReadonlyMap<string, string>): RRule {
	const list = (name: string) => parts.get(name)?.split(",") ?? [];
	const rule: RuleParts = {
		text,
		freq,
		interval: Number(parts.get("INTERVAL") ?? 1),
		byDay: list("BYDAY").map(toByDay),
		byMonthDay: list("BYMONTHDAY").map(Number),
		byMonth: list("BYMONTH").map(Number),
		bySetPos: list("BYSETPOS").map(Number),
	};
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- parseRRule has validated every part.
	return rule as RRule;
}

function toByDay(item: string): ByDay {
	return {
		ordinal: item.length > 2 ? Number(item.slice(0, -2)) : null,
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the BYDAY pattern ends in a weekday code.
		weekday: item.slice(-2) as Weekday,
	};
}

/**
 * Builds the library rule from an RFC 5545 DTSTART line so UNTIL must match the
 * DTSTART value type (DATE for all-day, UTC DATE-TIME for timed), exactly as the ICS
 * feed will carry it.
 */
export function compileRule(
	rule: RRule,
	timing: EventTiming,
	except: readonly Temporal.PlainDate[],
): RRuleTemporal {
	const dtstart =
		timing.kind === "timed"
			? `DTSTART;TZID=${SITE_TZ}:${toIcsDateTime(timing.start)}`
			: `DTSTART;VALUE=DATE:${toIcsDate(timing.first)}`;
	const plainTime = seriesStart(timing).toPlainTime();
	return new RRuleTemporal({
		rruleString: `${dtstart}\nRRULE:${rule.text}`,
		tzid: SITE_TZ,
		exDate: except.map((date) => date.toZonedDateTime({ timeZone: SITE_TZ, plainTime })),
		strict: true,
		temporal: Temporal,
	});
}
