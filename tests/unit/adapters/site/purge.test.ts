import { purgeTags, type CachePurge } from "@adapters/site/purge";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The JSON lines `log` writes at warn level while `run` runs. */
async function warnings(run: () => Promise<unknown>): Promise<unknown[]> {
	const lines: unknown[] = [];
	vi.spyOn(console, "warn").mockImplementation((line: string) => lines.push(JSON.parse(line)));
	await run();
	return lines;
}

const down: CachePurge = async () => {
	throw new TypeError("network lost");
};
const refused: CachePurge = async () => ({
	success: false,
	errors: [{ code: 1134, message: "Rate limited" }],
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("purging edge copies after a publish (M7 review S1)", () => {
	it("purges the tags and logs nothing when Cloudflare accepts", async () => {
		const purge = vi.fn<CachePurge>(async () => ({ success: true, errors: [] }));
		expect(await warnings(async () => purgeTags(purge, ["news", "01NEWS"]))).toEqual([]);
		expect(purge.mock.calls).toEqual([[{ tags: ["news", "01NEWS"] }]]);
	});

	it("logs, without throwing, a purge Cloudflare refuses, as when it rate-limits one", async () => {
		expect(await warnings(async () => purgeTags(refused, ["news", "01NEWS"]))).toEqual([
			{ level: "warn", event: "cache.purge_failed", tags: 2, error: "1134 Rate limited" },
		]);
	});

	it("logs, without throwing, when there is no Workers cache or the purge throws", async () => {
		expect(await warnings(async () => purgeTags(undefined, ["news"]))).toEqual([
			{
				level: "warn",
				event: "cache.purge_failed",
				tags: 1,
				error: "the Workers cache is not available here",
			},
		]);
		expect(await warnings(async () => purgeTags(down, ["news"]))).toEqual([
			{ level: "warn", event: "cache.purge_failed", tags: 1, error: "TypeError: network lost" },
		]);
	});

	it("does nothing for no tags", async () => {
		const purge = vi.fn<CachePurge>();
		await purgeTags(purge, []);
		expect(purge).not.toHaveBeenCalled();
	});
});
