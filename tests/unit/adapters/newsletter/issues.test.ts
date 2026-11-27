import { parseDoc, parseStoredIssue } from "@adapters/newsletter/issues";
import { describe, expect, it } from "vitest";

const ID = "00000000-0000-4000-8000-000000000001";
const stored = {
	status: "draft",
	revision: 2,
	testedRevision: 2,
	window: {
		kind: "first",
		from: "2027-01-15T15:00:00.000Z",
		to: "2027-04-15T14:00:00.000Z",
		previous: null,
	},
	coverageEnd: "2027-04-15T14:00:00.000Z",
	key: null,
	sendAt: null,
	broadcastId: null,
	at: null,
	subject: "Spring news",
	previewText: "",
	doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] },
	email: { html: "<p>Hi</p>", text: "Hi" },
	sent: null,
	slug: null,
	sendingUntil: null,
	createdAt: "2027-04-15T14:00:00.000Z",
};

describe("stored issues are parsed at the storage boundary", () => {
	it("reads a stored draft", () => {
		expect(parseStoredIssue(ID, stored)?.lifecycle).toMatchObject({
			status: "draft",
			id: ID,
			revision: 2,
			testedRevision: 2,
		});
	});

	it.each([
		["an id that is not a UUID", "issue-1", stored],
		["a revision below 1", ID, { ...stored, revision: 0 }],
		["an unknown status", ID, { ...stored, status: "archived" }],
		["a sent issue without a broadcast id", ID, { ...stored, status: "sent", key: "fm-issue:x" }],
		[
			"a later issue without the issue it follows",
			ID,
			{ ...stored, window: { ...stored.window, kind: "since-last" } },
		],
		[
			"a document that is not a node tree",
			ID,
			{ ...stored, doc: { type: "doc", content: [{ text: 1 }] } },
		],
	])("treats a row with %s as absent", (_, id, raw) => {
		expect(parseStoredIssue(id, raw)).toBeNull();
	});

	it("accepts only node trees as documents", () => {
		expect(parseDoc({ type: "doc", content: [] })).toEqual({ type: "doc", content: [] });
		expect(parseDoc({ type: "doc", attrs: "x" })).toBeNull();
		expect(parseDoc({ type: "doc", marks: {} })).toBeNull();
		expect(parseDoc("doc")).toBeNull();
	});
});
