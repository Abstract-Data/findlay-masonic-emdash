import type { Occurrence } from "../recurrence/series";
import { eventList } from "./assemble";
import { NODE, UPCOMING_EVENTS_HEADING, type DocNode } from "./nodes";

export interface EventRefresh {
	readonly doc: DocNode;
	/** True when any section's event list now reads differently. */
	readonly changed: boolean;
}

/**
 * R13: a draft's event lists were expanded at assembly and go stale. At approve time each body
 * section's "Upcoming events" list is replaced by `upcoming` for that body, or removed with its
 * heading when the body has none left. A section whose list the Admin deleted gets none back,
 * and a list whose lines already match is kept as the Admin styled it.
 */
export function refreshEvents(doc: DocNode, upcoming: readonly Occurrence[]): EventRefresh {
	let changed = false;
	const visit = (node: DocNode): DocNode => {
		const bodyId = node.attrs?.bodyId;
		if (node.type === NODE.section && typeof bodyId === "string") {
			const refreshed = refreshSection(
				node,
				upcoming.filter((o) => o.body === bodyId),
			);
			changed ||= refreshed !== node;
			return refreshed;
		}
		return node.content === undefined ? node : { ...node, content: node.content.map(visit) };
	};
	const next = visit(doc);
	return { doc: next, changed };
}

function refreshSection(section: DocNode, upcoming: readonly Occurrence[]): DocNode {
	const content = section.content ?? [];
	const at = content.findIndex(
		(node, index) => isEventsHeading(node) && content[index + 1]?.type === "bulletList",
	);
	const current = content[at + 1];
	if (at < 0 || current === undefined) return section;
	const fresh = upcoming.length === 0 ? null : eventList(upcoming);
	if (fresh !== null && sameLines(listLines(current), listLines(fresh))) return section;
	const replacement = fresh === null ? [] : [content[at], fresh];
	return {
		...section,
		content: [...content.slice(0, at), ...replacement, ...content.slice(at + 2)].filter(
			(node): node is DocNode => node !== undefined,
		),
	};
}

function isEventsHeading(node: DocNode): boolean {
	return (
		node.type === "heading" && node.attrs?.level === 3 && textOf(node) === UPCOMING_EVENTS_HEADING
	);
}

function listLines(list: DocNode): string[] {
	return (list.content ?? []).map(textOf);
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((line, index) => line === b[index]);
}

function textOf(node: DocNode): string {
	return (node.text ?? "") + (node.content ?? []).map(textOf).join("");
}
