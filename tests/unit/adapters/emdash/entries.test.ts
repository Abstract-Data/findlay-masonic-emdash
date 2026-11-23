import { readFileSync } from "node:fs";
import {
	COLLECTION_SCOPES,
	entryOperation,
	revisionRestoreOperation,
	saveOperation,
	scopeOf,
	storedBodies,
	targetBody,
} from "@adapters/emdash/entries";
import { describe, expect, it } from "vitest";
import { CHAPTER, LODGE } from "../../fixtures";

const live = { id: "E1", data: { body: LODGE, title: "Ladies Night" } };
// EmDash's read of an entry whose unpublished draft moves it to the Chapter.
const moved = { id: "E1", data: { body: CHAPTER }, liveData: { body: LODGE } };
const bodiesEntry = { id: LODGE, data: { name: "Findlay Lodge" } };

describe("stored bodies (FR-5.4, ADR-002)", () => {
	it("is the live body when there is no draft", () => {
		expect(storedBodies("body-field", live)).toEqual([LODGE]);
		expect(targetBody("body-field", live)).toBe(LODGE);
	});

	it("is the live body then the draft's when a draft moves the entry", () => {
		expect(storedBodies("body-field", moved)).toEqual([LODGE, CHAPTER]);
		expect(targetBody("body-field", moved)).toBe(CHAPTER);
	});

	it("is empty for an entry with no valid body", () => {
		expect(storedBodies("body-field", { id: "E2", data: { body: "" } })).toEqual([]);
		expect(storedBodies("body-field", { id: "E2" })).toEqual([]);
	});

	it("is the entry itself for a bodies entry", () => {
		expect(storedBodies("self", bodiesEntry)).toEqual([LODGE]);
	});
});

describe("saveOperation (FR-5.2, 5.5, 5.8)", () => {
	it("creates in the body the save names, or none", () => {
		expect(saveOperation("body-field", null, { body: CHAPTER })).toEqual({
			kind: "create",
			body: CHAPTER,
		});
		expect(saveOperation("body-field", null, { title: "x" })).toEqual({
			kind: "create",
			body: null,
		});
	});

	it("updates from the stored bodies to the body the saved entry holds", () => {
		expect(saveOperation("body-field", moved, { ...moved.data, title: "y" })).toEqual({
			kind: "update",
			from: [LODGE, CHAPTER],
			to: CHAPTER,
		});
		expect(saveOperation("body-field", live, { body: "" })).toEqual({
			kind: "update",
			from: [LODGE],
			to: null,
		});
	});

	it("keeps a bodies entry its own body and leaves adding a body to Admins", () => {
		expect(saveOperation("self", bodiesEntry, { name: "Renamed" })).toEqual({
			kind: "update",
			from: [LODGE],
			to: LODGE,
		});
		expect(saveOperation("self", null, { name: "New body" })).toEqual({
			kind: "admin-only",
			action: "add-body",
		});
	});

	it("does not guard site pages and fails closed on an unlisted collection", () => {
		expect(saveOperation("site", null, {})).toBeNull();
		expect(saveOperation("unlisted", null, {})).toEqual({
			kind: "admin-only",
			action: "unlisted",
		});
	});
});

describe("entryOperation (writes with no content hook)", () => {
	it("keeps the stored body on a data-less update", () => {
		expect(entryOperation("update", "body-field", moved)).toEqual({
			kind: "update",
			from: [LODGE, CHAPTER],
			to: CHAPTER,
		});
	});

	it.each(["delete", "restore", "discard", "unschedule"] as const)(
		"needs every stored body to %s",
		(action) => {
			expect(entryOperation(action, "body-field", moved)).toEqual({
				kind: action,
				bodies: [LODGE, CHAPTER],
			});
		},
	);

	it("creates a duplicate in the live body, since it copies the live values", () => {
		expect(entryOperation("duplicate", "body-field", moved)).toEqual({
			kind: "create",
			body: LODGE,
		});
		expect(entryOperation("duplicate", "self", bodiesEntry)).toEqual({
			kind: "admin-only",
			action: "add-body",
		});
	});

	it("moves the entry to the body a restored revision holds", () => {
		expect(revisionRestoreOperation("body-field", live, { body: CHAPTER })).toEqual({
			kind: "update",
			from: [LODGE],
			to: CHAPTER,
		});
		expect(revisionRestoreOperation("self", bodiesEntry, { name: "Old" })).toEqual({
			kind: "update",
			from: [LODGE],
			to: LODGE,
		});
	});
});

describe("collection scopes (constitution § Per-body access control)", () => {
	const seed: unknown = JSON.parse(readFileSync("seed/seed.json", "utf8"));
	const collections: { slug: string; fields: { slug: string; type: string }[] }[] = Reflect.get(
		Object(seed),
		"collections",
	);

	it("classifies every seeded collection, so none is locked to Admins by accident", () => {
		expect(collections.map((c) => scopeOf(c.slug)).filter((s) => s === "unlisted")).toEqual([]);
		expect(Object.keys(COLLECTION_SCOPES).toSorted()).toEqual(
			collections.map((c) => c.slug).toSorted(),
		);
	});

	it("guards by its body field every collection that has one", () => {
		for (const collection of collections) {
			const hasBody = collection.fields.some((f) => f.slug === "body" && f.type === "reference");
			expect(scopeOf(collection.slug) === "body-field").toBe(hasBody);
		}
	});

	it("treats a collection added later as Admin-only until it is classified", () => {
		expect(scopeOf("minutes")).toBe("unlisted");
	});
});
