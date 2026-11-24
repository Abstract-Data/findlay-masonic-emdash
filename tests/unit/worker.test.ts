import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// src/worker.ts runs under workerd; here EmDash's Worker package and its scheduled-task runner
// are replaced so the Worker's own scheduled() can run in Node. The stand-in for
// createScheduledHandler does what @emdash-cms/cloudflare 1.6 does (dist/worker.mjs): queue
// runScheduledTasks in waitUntil and log, not throw, its failure.
const emdash = vi.hoisted(() => ({
	runScheduledTasks: vi.fn<(options?: unknown) => Promise<{ published: unknown[] }>>(),
	purge:
		vi.fn<(options: { tags?: string[] }) => Promise<{ success: boolean; errors: unknown[] }>>(),
}));
vi.mock("emdash/middleware", () => ({ runScheduledTasks: emdash.runScheduledTasks }));
vi.mock("cloudflare:workers", () => ({ cache: { purge: emdash.purge } }));
vi.mock("@emdash-cms/cloudflare/worker", () => ({
	default: { fetch: async () => new Response("page") },
	EmDashRoom: {},
	EmDashRoomSite: {},
	PluginBridge: {},
	createScheduledHandler:
		() =>
		(_controller: unknown, _env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }) => {
			ctx.waitUntil(
				(async () => {
					try {
						const { runScheduledTasks } = await import("emdash/middleware");
						await runScheduledTasks({});
					} catch (error) {
						console.error("[scheduled] runScheduledTasks failed:", error);
					}
				})(),
			);
		},
}));

const { default: worker } = await import("../../src/worker");

const PING = `https://ping.checklyhq.com/${["fake", "test", "ping"].join("-")}`;
const TOP_OF_HOUR = Date.UTC(2026, 10, 24, 15, 0, 0);

/** Every ping the Worker sends, and when, against the order the scheduled work finished in. */
function heartbeat() {
	const events: string[] = [];
	vi.stubGlobal("fetch", async (url: string) => {
		events.push(`ping ${url}`);
		return new Response(null, { status: 200 });
	});
	return events;
}

/** One cron run of the Worker, settled with everything it handed to waitUntil. */
async function cron(scheduledTime = TOP_OF_HOUR): Promise<"resolved" | "rejected"> {
	const pending: Promise<unknown>[] = [];
	const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise), props: {} };
	const controller = { cron: "* * * * *", scheduledTime, noRetry() {} };
	const env = { CHECKLY_HEARTBEAT_URL: PING };
	const run = Reflect.apply(Reflect.get(worker, "scheduled"), worker, [controller, env, ctx]);
	const outcome = await Promise.resolve(run).then(
		() => "resolved" as const,
		() => "rejected" as const,
	);
	await Promise.allSettled(pending);
	return outcome;
}

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	emdash.purge.mockResolvedValue({ success: true, errors: [] });
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	emdash.runScheduledTasks.mockReset();
	emdash.purge.mockReset();
});

describe("the Worker's cron run and its heartbeat (M7 review B2)", () => {
	it("sends no heartbeat when EmDash's scheduled run fails", async () => {
		const events = heartbeat();
		emdash.runScheduledTasks.mockRejectedValue(new Error("D1 is unreachable"));
		await cron();
		expect(events).toEqual([]);
	});

	it("pings only after the scheduled run has finished", async () => {
		const events = heartbeat();
		emdash.runScheduledTasks.mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
			events.push("scheduled work done");
			return { published: [] };
		});
		expect(await cron()).toBe("resolved");
		expect(events).toEqual(["scheduled work done", `ping ${PING}`]);
	});

	it("purges the edge copies of what the scheduled run published", async () => {
		heartbeat();
		emdash.runScheduledTasks.mockImplementation(async (options) => {
			const published = [
				{ collection: "news", id: "01NEWS" },
				{ collection: "news", id: "01MORE" },
			];
			await Reflect.get(Object(options), "onPublished")(published);
			return { published };
		});
		await cron(TOP_OF_HOUR + 60_000);
		expect(emdash.purge.mock.calls).toEqual([[{ tags: ["news", "01NEWS", "01MORE"] }]]);
	});

	it("still finishes the run when the ping fails", async () => {
		vi.stubGlobal("fetch", async () => {
			throw new TypeError("fetch failed");
		});
		emdash.runScheduledTasks.mockResolvedValue({ published: [] });
		expect(await cron()).toBe("resolved");
		expect(emdash.runScheduledTasks).toHaveBeenCalledTimes(1);
	});
});
