import { randomUUID } from "node:crypto";
import { test as base, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { storageStatePath, type SignedInRole } from "./roles";

export { expect };

/** EmDash's CSRF guard wants this header (or a bearer token) on every API write. */
export const API_HEADERS = { "X-EmDash-Request": "1" };

export const NEWS = "/_emdash/api/content/news";

export type Bodies = Readonly<Record<"blue-lodge" | "chapter", string>>;

interface Fixtures {
	/** An API client signed in as `role`, from the setup project's storage state. */
	as: (role: SignedInRole) => Promise<APIRequestContext>;
	bodies: Bodies;
}

export const test = base.extend<Fixtures>({
	as: async ({ playwright, baseURL }, use) => {
		const opened: APIRequestContext[] = [];
		await use(async (role) => {
			const context = await playwright.request.newContext({
				baseURL,
				ignoreHTTPSErrors: true,
				storageState: storageStatePath(role),
				extraHTTPHeaders: { ...API_HEADERS, Origin: new URL(baseURL ?? "").origin },
			});
			opened.push(context);
			return context;
		});
		await Promise.all(opened.map(async (context) => context.dispose()));
	},
	bodies: async ({ as }, use) => {
		const admin = await as("admin");
		const list = await data<{ items: { id: string; slug: string }[] }>(
			admin.get("/_emdash/api/content/bodies?limit=50"),
		);
		const id = (slug: string) => list.items.find((item) => item.slug === slug)?.id ?? "";
		await use({ "blue-lodge": id("blue-lodge"), chapter: id("chapter") });
	},
});

/** The `data` of a successful EmDash response; fails the test with the body otherwise. */
export async function data<T>(pending: Promise<APIResponse>): Promise<T> {
	const response = await pending;
	const text = await response.text();
	expect(response.ok(), `${response.status()} ${text}`).toBe(true);
	const parsed: unknown = JSON.parse(text);
	return Reflect.get(Object(parsed), "data");
}

export function unique(label: string): string {
	return `${label}-${randomUUID().slice(0, 8)}`;
}

export function newsData(body: string | undefined, extra: Record<string, unknown> = {}) {
	return {
		title: unique("News"),
		...(body === undefined ? {} : { body }),
		content: [],
		publish_date: "2026-11-20T12:00:00Z",
		...extra,
	};
}

/** Creates a news entry as `client` and returns its id. */
export async function createNews(
	client: APIRequestContext,
	body: string,
	extra: Record<string, unknown> = {},
): Promise<string> {
	const created = await data<{ item: { id: string } }>(
		client.post(NEWS, { data: { data: newsData(body, extra), slug: unique("news") } }),
	);
	return created.item.id;
}

interface ErrorBody {
	readonly code: string;
	readonly message: string;
}

export async function failure(pending: Promise<APIResponse>, status: number): Promise<ErrorBody> {
	const response = await pending;
	const text = await response.text();
	expect(response.status(), text).toBe(status);
	const parsed: unknown = JSON.parse(text);
	const error: unknown = Reflect.get(Object(parsed), "error");
	return {
		code: String(Reflect.get(Object(error), "code")),
		message: String(Reflect.get(Object(error), "message")),
	};
}

/** The middleware's refusal: 403 BODY_ACCESS_DENIED with a plain-text reason. */
export async function expectDenied(pending: Promise<APIResponse>, names: string): Promise<void> {
	const error = await failure(pending, 403);
	expect(error.code).toBe("BODY_ACCESS_DENIED");
	expect(error.message).toContain(names);
	expect(error.message).not.toMatch(/[<>]/);
}

/** A content hook's refusal, with the code EmDash gives it and a plain-text reason. */
export async function expectRejected(
	pending: Promise<APIResponse>,
	code: string,
	names: string,
): Promise<void> {
	const error = await failure(pending, 422);
	expect(error.code).toBe(code);
	expect(error.message).toContain(names);
}
