import { pingHeartbeat } from "@adapters/heartbeat";
import { afterEach, describe, expect, it, vi } from "vitest";

const URL_SECRET = "https://ping.checklyhq.com/0d2a1f3e-0000-4000-8000-000000000001";
const TOP_OF_HOUR = Date.UTC(2026, 10, 24, 15, 0, 0);

afterEach(() => {
	vi.restoreAllMocks();
});

describe("the scheduler heartbeat (Checkly HeartbeatMonitor)", () => {
	it("pings once an hour, on the run scheduled at the top of the hour", async () => {
		const pinged: string[] = [];
		const send = async (url: string) => {
			pinged.push(url);
			return new Response(null, { status: 200 });
		};
		expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR, send)).toBe("pinged");
		for (let minute = 1; minute < 60; minute += 1) {
			// oxlint-disable-next-line no-await-in-loop -- one scheduled run at a time.
			expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR + minute * 60_000, send)).toBe("skipped");
		}
		expect(pinged).toEqual([URL_SECRET]);
	});

	it.each([undefined, "", "not a url", "http://ping.checklyhq.com/x", 42])(
		"pings nothing when the URL is %s",
		async (url) => {
			const send = vi.fn<(url: string) => Promise<Response>>(async () => new Response(null));
			expect(await pingHeartbeat(url, TOP_OF_HOUR, send)).toBe("skipped");
			expect(send).not.toHaveBeenCalled();
		},
	);

	it("reports a failed ping without throwing or logging the URL", async () => {
		const warned: string[] = [];
		vi.spyOn(console, "warn").mockImplementation((line: string) => warned.push(line));
		const down = async () => {
			throw new TypeError(`fetch failed for ${URL_SECRET}`);
		};
		expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR, down)).toBe("failed");
		expect(
			await pingHeartbeat(URL_SECRET, TOP_OF_HOUR, async () => new Response(null, { status: 503 })),
		).toBe("failed");
		expect(warned.map((line) => JSON.parse(line).event)).toEqual([
			"heartbeat.failed",
			"heartbeat.failed",
		]);
		expect(warned.join("")).not.toContain("0d2a1f3e-0000-4000-8000-000000000001");
	});
});
