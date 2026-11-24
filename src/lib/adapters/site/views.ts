import {
	parseBodyId,
	parseBodyRecord,
	parseEntryId,
	parseRecipients,
	parseTag,
	parseTags,
} from "@adapters/emdash/parse";
import type { BodyType } from "@core/acl/officer-titles";
import { COLOUR_KEY } from "@core/bodies/colour";
import { shortLabel } from "@core/bodies/label";
import type { TermOfficer } from "@core/bodies/officers";
import type { BodyId, EntryId, TagSlug } from "@core/ids";
import type { EmDashCollections, PortableTextBlock } from "emdash";
import { Temporal } from "temporal-polyfill";

type BodyData = EmDashCollections["bodies"];
type OfficerData = EmDashCollections["officers"];
type NewsData = EmDashCollections["news"];

/** The slice of an EmDash entry the views read: `id` is the slug, `data.id` the ULID. */
export interface Entry<T> {
	readonly id: string;
	readonly data: T;
}

export interface TagOption {
	readonly slug: TagSlug;
	readonly label: string;
}

/** A published body as the public pages show it. `contact_recipients` never leaves here. */
export interface BodyView {
	readonly id: BodyId;
	readonly slug: string;
	readonly name: string;
	/** "Findlay Lodge No. 227" */
	readonly displayName: string;
	/** "Lodge 227": the label calendars and news lists carry (FR-3.4, FR-4.4). */
	readonly label: string;
	readonly bodyType: BodyType | null;
	/** FR-4.4: the `data-colour` key theme.css maps to the body's colour; null shows none. */
	readonly colour: string | null;
	readonly emblem: BodyData["emblem"] | null;
	readonly description: PortableTextBlock[];
	readonly scheduleNote: string | null;
	/** Whether the contact form can reach anyone (Q12). */
	readonly acceptsMessages: boolean;
	readonly tags: readonly TagOption[];
}

export interface OfficerView extends TermOfficer {
	readonly id: EntryId;
	readonly photo: OfficerData["photo"] | null;
}

export interface NewsView {
	readonly id: EntryId;
	readonly slug: string;
	readonly body: BodyId;
	readonly title: string;
	readonly publishedAt: Temporal.Instant;
	readonly tags: readonly TagSlug[];
	readonly image: NewsData["featured_image"] | null;
	readonly content: PortableTextBlock[];
}

export function parseBodyView(entry: Entry<BodyData>): BodyView | null {
	const record = parseBodyRecord({ id: entry.data.id, data: entry.data });
	if (record === null) return null;
	const number = entry.data.number ?? null;
	return {
		id: record.id,
		slug: entry.data.slug ?? entry.id,
		name: entry.data.name,
		displayName: record.displayName,
		label: shortLabel(record.bodyType, entry.data.name, number),
		bodyType: record.bodyType,
		colour: record.colour === null ? null : COLOUR_KEY[record.colour],
		emblem: entry.data.emblem ?? null,
		description: entry.data.description ?? [],
		scheduleNote: text(entry.data.schedule_note),
		acceptsMessages: parseRecipients(entry.data.contact_recipients).length > 0,
		tags: tagOptions(entry.data.tag_vocabulary),
	};
}

export function parseOfficerView(entry: Entry<OfficerData>): OfficerView | null {
	const id = parseEntryId(entry.data.id);
	const name = text(entry.data.name);
	if (id === null || name === null || !Number.isInteger(entry.data.term_year)) return null;
	return {
		id,
		name,
		title: entry.data.title,
		termYear: entry.data.term_year,
		order: typeof entry.data.display_order === "number" ? entry.data.display_order : null,
		photo: entry.data.photo ?? null,
	};
}

export function parseNewsView(entry: Entry<NewsData>): NewsView | null {
	const id = parseEntryId(entry.data.id);
	const body = parseBodyId(entry.data.body);
	const title = text(entry.data.title);
	const publishedAt = instant(entry.data.publish_date) ?? instant(entry.data.publishedAt);
	const tags = parseTags(entry.data.tags);
	if (id === null || body === null || title === null || publishedAt === null) return null;
	return {
		id,
		slug: entry.data.slug ?? entry.id,
		body,
		title,
		publishedAt,
		tags: tags.ok ? tags.value : [],
		image: entry.data.featured_image ?? null,
		content: entry.data.content,
	};
}

/** Newest first, by the editor's publish date. */
export function newestFirst(a: NewsView, b: NewsView): number {
	return Temporal.Instant.compare(b.publishedAt, a.publishedAt);
}

/** `?tag=` against the body's vocabulary: an unknown tag is no filter. */
export function chosenTag(raw: string | null, body: BodyView): TagOption | null {
	const slug = raw === null ? null : parseTag(raw);
	return body.tags.find((tag) => tag.slug === slug) ?? null;
}

/** `?body=<slug>` values against the published bodies; unknown slugs are ignored. */
export function chosenBodies(slugs: readonly string[], bodies: readonly BodyView[]): BodyView[] {
	const wanted = new Set(slugs);
	return bodies.filter((body) => wanted.has(body.slug));
}

function tagOptions(rows: BodyData["tag_vocabulary"]): TagOption[] {
	const seen = new Set<string>();
	return (rows ?? []).flatMap((row) => {
		const slug = parseTag(row.slug);
		if (slug === null || seen.has(slug)) return [];
		seen.add(slug);
		return [{ slug, label: text(row.label) ?? slug }];
	});
}

function instant(raw: unknown): Temporal.Instant | null {
	if (raw instanceof Date) return Temporal.Instant.fromEpochMilliseconds(raw.getTime());
	if (typeof raw !== "string") return null;
	try {
		return Temporal.Instant.from(raw);
	} catch {
		return null;
	}
}

function text(raw: unknown): string | null {
	return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}
