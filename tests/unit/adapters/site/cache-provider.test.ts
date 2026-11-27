import { afterEach, describe, expect, it, vi } from "vitest";

const workers = vi.hoisted(() => ({
	purge: vi.fn<(options: { tags: string[] }) => Promise<{ success: boolean; errors: unknown[] }>>(),
}));
vi.mock("cloudflare:workers", () => ({ cache: { purge: workers.purge }, env: {} }));

const { default: provider } = await import("@adapters/site/cache-provider");

/** The JSON lines `log` writes at warn level while `run` runs. */
async function warnings(run: () => Promise<unknown>): Promise<unknown[]> {
	const lines: unknown[] = [];
	vi.spyOn(console, "warn").mockImplementation((line: string) => lines.push(JSON.parse(line)));
	await run();
	return lines;
}

afterEach(() => {
	vi.restoreAllMocks();
	workers.purge.mockReset();
});

describe("the route cache's purge on publish (M7 review S1)", () => {
	it("purges the published entry's tags and the path's tag", async () => {
		workers.purge.mockResolvedValue({ success: true, errors: [] });
		const lines = await warnings(async () =>
			provider(undefined).invalidate({ tags: ["news", "01NEWS"], path: "/news" }),
		);
		expect(lines).toEqual([]);
		expect(workers.purge.mock.calls).toEqual([[{ tags: ["news", "01NEWS", "astro-path:/news"] }]]);
	});

	it("logs a purge Cloudflare refuses, and lets the publish stand", async () => {
		workers.purge.mockResolvedValue({
			success: false,
			errors: [{ code: 1134, message: "Rate limited" }],
		});
		const lines = await warnings(async () => provider(undefined).invalidate({ tags: ["news"] }));
		expect(lines).toEqual([
			{ level: "warn", event: "cache.purge_failed", tags: 1, error: "1134 Rate limited" },
		]);
	});

	it("still sets the headers Astro's Cloudflare provider sets", () => {
		const headers = provider(undefined).setHeaders?.(
			{ maxAge: 900, tags: ["news"] },
			new Request("https://findlaymason.org/news"),
		);
		expect(headers?.get("Cloudflare-CDN-Cache-Control")).toBe("public, max-age=900");
		expect(headers?.get("Cache-Tag")).toBe("news,astro-path:/news");
	});
});
