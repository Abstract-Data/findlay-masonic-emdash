import { pingHeartbeat } from "@adapters/heartbeat";
import { afterEach, describe, expect, it, vi } from "vitest";

// A heartbeat URL is a credential, so the test one is assembled from obviously fake parts.
const PING_ID = ["fake", "test", "ping", "0000"].join("-");
const URL_SECRET = `https://ping.checklyhq.com/${PING_ID}`;
const TOP_OF_HOUR = Date.UTC(2026, 10, 24, 15, 0, 0);
const ok = async () => true;

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
		expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR, send, ok)).toBe("pinged");
		for (let minute = 1; minute < 60; minute += 1) {
			// oxlint-disable-next-line no-await-in-loop -- one scheduled run at a time.
			expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR + minute * 60_000, send, ok)).toBe(
				"skipped",
			);
		}
		expect(pinged).toEqual([URL_SECRET]);
	});

	it.each([undefined, "", "not a url", "http://ping.checklyhq.com/x", 42])(
		"pings nothing when the URL is %s",
		async (url) => {
			const send = vi.fn<(url: string) => Promise<Response>>(async () => new Response(null));
			expect(await pingHeartbeat(url, TOP_OF_HOUR, send, ok)).toBe("skipped");
			expect(send).not.toHaveBeenCalled();
		},
	);

	it("withholds the ping when the run left something undone, and asks only at the top of the hour", async () => {
		const send = vi.fn<(url: string) => Promise<Response>>(async () => new Response(null));
		const healthy = vi.fn<() => Promise<boolean>>(async () => false);
		expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR, send, healthy)).toBe("withheld");
		expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR + 60_000, send, healthy)).toBe("skipped");
		expect(send).not.toHaveBeenCalled();
		expect(healthy).toHaveBeenCalledTimes(1);
	});

	it("still asks once an hour with no URL, so an overdue entry is logged without Checkly", async () => {
		const send = vi.fn<(url: string) => Promise<Response>>(async () => new Response(null));
		const healthy = vi.fn<() => Promise<boolean>>(async () => false);
		expect(await pingHeartbeat(undefined, TOP_OF_HOUR, send, healthy)).toBe("withheld");
		expect(await pingHeartbeat(undefined, TOP_OF_HOUR + 60_000, send, healthy)).toBe("skipped");
		expect(await pingHeartbeat(undefined, TOP_OF_HOUR, send, ok)).toBe("skipped");
		expect(send).not.toHaveBeenCalled();
		expect(healthy).toHaveBeenCalledTimes(1);
	});

	it("reports a failed ping without throwing or logging the URL", async () => {
		const warned: string[] = [];
		vi.spyOn(console, "warn").mockImplementation((line: string) => warned.push(line));
		const down = async () => {
			throw new TypeError(`fetch failed for ${URL_SECRET}`);
		};
		expect(await pingHeartbeat(URL_SECRET, TOP_OF_HOUR, down, ok)).toBe("failed");
		expect(
			await pingHeartbeat(
				URL_SECRET,
				TOP_OF_HOUR,
				async () => new Response(null, { status: 503 }),
				ok,
			),
		).toBe("failed");
		expect(warned.map((line) => JSON.parse(line).event)).toEqual([
			"heartbeat.failed",
			"heartbeat.failed",
		]);
		expect(warned.join("")).not.toContain(PING_ID);
	});
});
