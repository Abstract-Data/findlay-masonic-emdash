import { describe, expect, it } from "vitest";
import { TITLES_BY_BODY_TYPE } from "@core/acl/officer-titles";
import seedJson from "../../seed/seed.json";

interface SeedField {
	slug: string;
	type: string;
	required?: boolean;
	indexed?: boolean;
	options?: { collection?: string };
	validation?: { options?: string[]; subFields?: unknown[]; targetCollection?: string };
}
interface SeedCollection {
	slug: string;
	fields: SeedField[];
}
interface SeedEntry {
	id: string;
	slug?: string;
	data: Record<string, unknown>;
}
interface Seed {
	settings?: { timezone?: string };
	collections: SeedCollection[];
	taxonomies?: { name: string }[];
	content: Record<string, SeedEntry[]>;
}

const seed: Seed = seedJson;
const BODY_SCOPED = ["officers", "events", "news"];

function collection(slug: string): SeedCollection {
	const found = seed.collections.find((c) => c.slug === slug);
	if (!found) throw new Error(`seed has no ${slug} collection`);
	return found;
}

function field(collectionSlug: string, slug: string): SeedField {
	const found = collection(collectionSlug).fields.find((f) => f.slug === slug);
	if (!found) throw new Error(`${collectionSlug} has no ${slug} field`);
	return found;
}

const bodies = seed.content.bodies ?? [];

describe("seed: the six bodies (FR-9.2)", () => {
	it("seeds exactly six bodies", () => {
		expect(bodies).toHaveLength(6);
	});

	it("numbers each body as findlaymason.org does, and the Temple Board has none", () => {
		const numbers = Object.fromEntries(
			bodies.map((b) => [b.data.body_type, b.data.number ?? null]),
		);
		expect(numbers).toEqual({
			"Blue Lodge": 227,
			Chapter: 58,
			Council: 50,
			Commandery: 49,
			"Order of the Eastern Star": 23,
			"Temple Board": null,
		});
	});

	it("gives every body a unique slug and display_order", () => {
		const slugs = bodies.map((b) => b.slug);
		const orders = bodies.map((b) => b.data.display_order);
		expect(new Set(slugs).size).toBe(6);
		expect(new Set(orders).size).toBe(6);
	});

	it("lists bodies first in content so $ref:body-* resolves", () => {
		expect(Object.keys(seed.content)[0]).toBe("bodies");
	});
});

describe("seed: per-body access control", () => {
	it.each(BODY_SCOPED)("%s has a required, indexed, unbound body reference to bodies", (slug) => {
		const body = field(slug, "body");
		expect(body).toMatchObject({
			type: "reference",
			required: true,
			indexed: true,
			options: { collection: "bodies" },
		});
		expect(body.validation?.targetCollection).toBeUndefined();
	});

	it("points every seeded body value at a seeded body by $ref", () => {
		const bodyIds = new Set(bodies.map((b) => b.id));
		for (const slug of BODY_SCOPED) {
			for (const entry of seed.content[slug] ?? []) {
				const ref = String(entry.data.body);
				expect(ref, `${slug}/${entry.id}`).toMatch(/^\$ref:/);
				expect(bodyIds.has(ref.slice("$ref:".length)), `${slug}/${entry.id}`).toBe(true);
			}
		}
	});
});

describe("seed: officer titles and body types", () => {
	it("offers exactly the body types the title table knows", () => {
		expect(field("bodies", "body_type").validation?.options).toEqual(
			Object.keys(TITLES_BY_BODY_TYPE),
		);
	});

	it("offers the de-duplicated union of every body type's titles", () => {
		const union = [...new Set(Object.values(TITLES_BY_BODY_TYPE).flat())];
		expect(field("officers", "title").validation?.options).toEqual(union);
	});
});

describe("seed: blog template removed", () => {
	it("has no posts collection and no taxonomies", () => {
		expect(seed.collections.map((c) => c.slug)).not.toContain("posts");
		expect(seed.taxonomies ?? []).toEqual([]);
	});

	it("reads naive datetimes as Findlay wall time", () => {
		expect(seed.settings?.timezone).toBe("America/New_York");
	});
});
