import {
	parseAbsoluteUrl,
	parseBodyId,
	parseBodyRecord,
	parseEntryId,
} from "@adapters/emdash/parse";
import { paths } from "@adapters/site/paths";
import type { BodySummary, NewsCandidate } from "@core/newsletter/assemble";
import type { PortableTextBlock } from "@core/newsletter/excerpt";
import type { BodyId } from "@core/ids";
import { Temporal } from "temporal-polyfill";

/** The slice of an EmDash content item the newsletter reads. */
export interface ListedItem {
	readonly id: string;
	readonly slug: string | null;
	readonly data: Readonly<Record<string, unknown>>;
	readonly publishedAt: string | null;
}

export interface BodyListing {
	readonly bodies: BodySummary[];
	/** Body id to its page slug, for article links. */
	readonly slugs: ReadonlyMap<BodyId, string>;
}

export function parseBodies(items: readonly ListedItem[]): BodyListing {
	const bodies: BodySummary[] = [];
	const slugs = new Map<BodyId, string>();
	for (const item of items) {
		const record = parseBodyRecord(item);
		if (record === null) continue;
		bodies.push({ id: record.id, name: record.displayName, displayOrder: record.order });
		if (item.slug !== null) slugs.set(record.id, item.slug);
	}
	return { bodies, slugs };
}

function instant(raw: unknown): Temporal.Instant | null {
	if (typeof raw !== "string") return null;
	try {
		return Temporal.Instant.from(raw);
	} catch {
		return null;
	}
}

function blocks(raw: unknown): PortableTextBlock[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(block: unknown): block is PortableTextBlock =>
			typeof block === "object" &&
			block !== null &&
			typeof Reflect.get(block, "_type") === "string",
	);
}

function image(raw: unknown, origin: string): NewsCandidate["image"] {
	if (typeof raw !== "object" || raw === null) return null;
	const src: unknown = Reflect.get(raw, "src");
	const alt: unknown = Reflect.get(raw, "alt");
	if (typeof src !== "string" || src === "" || !URL.canParse(src, origin)) return null;
	const absolute = parseAbsoluteUrl(new URL(src, origin).href);
	return absolute === null ? null : { src: absolute, alt: typeof alt === "string" ? alt : "" };
}

/** A published `news` item as an assembly candidate, linking to its page on the site (R8). */
export function parseNewsCandidate(
	item: ListedItem,
	bodySlugs: ReadonlyMap<BodyId, string>,
	origin: string,
): NewsCandidate | null {
	const id = parseEntryId(item.id);
	const body = parseBodyId(item.data.body);
	const title = typeof item.data.title === "string" ? item.data.title.trim() : "";
	const publishedAt = instant(item.data.publish_date) ?? instant(item.publishedAt);
	const bodySlug = body === null ? undefined : bodySlugs.get(body);
	if (id === null || body === null || title === "" || publishedAt === null || !bodySlug) {
		return null;
	}
	const href = parseAbsoluteUrl(
		new URL(paths.newsItem(bodySlug, item.slug ?? item.id), origin).href,
	);
	if (href === null) return null;
	return {
		id,
		body,
		title,
		content: blocks(item.data.content),
		href,
		image: image(item.data.featured_image, origin),
		publishedAt,
		includeInNewsletter: item.data.include_in_newsletter !== false,
	};
}
