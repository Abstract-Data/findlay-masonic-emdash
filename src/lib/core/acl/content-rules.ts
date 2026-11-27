import { err, ok, type BodyId, type Result, type TagSlug } from "../ids";
import { TITLES_BY_BODY_TYPE, type BodyType } from "./officer-titles";

export type RuleViolation =
	| { readonly code: "unknown-tags"; readonly body: BodyId; readonly tags: readonly TagSlug[] }
	| {
			readonly code: "title-not-for-body-type";
			readonly title: string;
			readonly bodyType: BodyType;
	  }
	| { readonly code: "translation-in-another-body"; readonly body: BodyId };

/**
 * ADR-002: a translation joins its source's body, so no translation group spans two bodies and
 * a group-wide write never reaches another body's entry. Applies to Admins too.
 */
export function checkTranslationBody(
	body: BodyId,
	sourceBody: BodyId,
): Result<void, RuleViolation> {
	return body === sourceBody
		? ok(undefined)
		: err({ code: "translation-in-another-body", body: sourceBody });
}

/** FR-3.2: every tag must be in the body's own vocabulary. Applies to Admins too. */
export function checkTags(
	tags: readonly TagSlug[],
	vocabulary: ReadonlySet<TagSlug>,
	body: BodyId,
): Result<void, RuleViolation> {
	const unknown = [...new Set(tags)].filter((tag) => !vocabulary.has(tag));
	return unknown.length === 0 ? ok(undefined) : err({ code: "unknown-tags", body, tags: unknown });
}

/** FR-2.1: one select holds every body type's titles, so the per-type list is checked here. */
export function checkOfficerTitle(title: string, bodyType: BodyType): Result<void, RuleViolation> {
	const titles: readonly string[] = TITLES_BY_BODY_TYPE[bodyType];
	return titles.includes(title)
		? ok(undefined)
		: err({ code: "title-not-for-body-type", title, bodyType });
}
