import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// src/worker.ts runs under workerd; here EmDash's Worker package and its scheduled-task runner
// are replaced so the Worker's own scheduled() can run in Node. The stand-in for
// createScheduledHandler does what @emdash-cms/cloudflare 1.6 does (dist/worker.mjs): queue
// runScheduledTasks in waitUntil and log, not throw, its failure. The content store answers
// findReadyToPublish as EmDash 1.6 does: entries whose scheduled_at is at or before the time.
const emdash = vi.hoisted(() => ({
	runScheduledTasks: vi.fn<(options?: unknown) => Promise<{ published: unknown[] }>>(),
	/** Each collection's entries still waiting to be published, by when they were due. */
	scheduled: new Map<string, { id: string; title: string; scheduledAt: string }[]>(),
	/** What withEmDashRuntime throws instead of running, as it does when EmDash is not set up. */
	runtimeError: null as Error | null,
	purge:
		vi.fn<(options: { tags?: string[] }) => Promise<{ success: boolean; errors: unknown[] }>>(),
	/** What EmDash's Astro handler answers a request with. */
	page: vi.fn<(request: Request) => Response>(),
}));
vi.mock("emdash/middleware", () => ({
	runScheduledTasks: emdash.runScheduledTasks,
	withEmDashRuntime: async (run: (runtime: unknown) => unknown) => {
		if (emdash.runtimeError !== null) throw emdash.runtimeError;
		const collections = [...emdash.scheduled.keys()].map((slug) => ({ slug }));
		return run({ db: "d1", schemaRegistry: { listCollections: async () => collections } });
	},
}));
vi.mock("emdash", async (original) => ({
	...(await original<object>()),
	ContentRepository: class {
		async findReadyToPublish(type: string, limit: number, currentTime: Date) {
			const due = (emdash.scheduled.get(type) ?? []).filter(
				(entry) => entry.scheduledAt <= currentTime.toISOString(),
			);
			return due.slice(0, limit);
		}
	},
}));
vi.mock("cloudflare:workers", () => ({ cache: { purge: emdash.purge } }));
vi.mock("@emdash-cms/cloudflare/worker", () => ({
	default: { fetch: async (request: Request) => emdash.page(request) },
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
	vi.useRealTimers();
	emdash.runScheduledTasks.mockReset();
	emdash.purge.mockReset();
	emdash.scheduled.clear();
	emdash.runtimeError = null;
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

const NOW = TOP_OF_HOUR + 20_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

/** The JSON lines the Worker logged at `level`. */
function logged(level: "error" | "warn"): Record<string, unknown>[] {
	return vi
		.mocked(console[level])
		.mock.calls.flatMap(([line]) =>
			typeof line === "string" && line.startsWith("{") ? [JSON.parse(line)] : [],
		);
}

describe("the heartbeat means nothing is overdue (M7 review round 2, B2)", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
		emdash.runScheduledTasks.mockResolvedValue({ published: [] });
	});

	it("sends no heartbeat while an entry the run should have published is still waiting", async () => {
		const events = heartbeat();
		emdash.scheduled.set("news", [
			{ id: "01NEWS", title: "Ladies' Night", scheduledAt: ago(5 * 60_000) },
		]);
		expect(await cron()).toBe("resolved");
		expect(events).toEqual([]);
		expect(logged("error")).toEqual([
			{ level: "error", event: "scheduler.overdue", entries: 1, collections: 1 },
		]);
		expect(JSON.stringify(logged("error"))).not.toContain("Ladies");
	});

	it("checks every collection, not only news", async () => {
		const events = heartbeat();
		emdash.scheduled.set("news", []);
		emdash.scheduled.set("events", [
			{ id: "01EVENT", title: "Installation", scheduledAt: ago(3 * 60_000) },
			{ id: "01EVEN2", title: "Picnic", scheduledAt: ago(60 * 60_000) },
		]);
		emdash.scheduled.set("pages", [
			{ id: "01PAGE", title: "History", scheduledAt: ago(10 * 60_000) },
		]);
		await cron();
		expect(events).toEqual([]);
		expect(logged("error")).toEqual([
			{ level: "error", event: "scheduler.overdue", entries: 3, collections: 2 },
		]);
	});

	it("counts an entry that fell due during the run and is still waiting", async () => {
		const events = heartbeat();
		emdash.runScheduledTasks.mockImplementation(async () => {
			vi.setSystemTime(NOW + 9_000);
			return { published: [] };
		});
		emdash.scheduled.set("news", [{ id: "01NEWS", title: "Due", scheduledAt: ago(-7_000) }]);
		await cron();
		expect(events).toEqual([]);
	});

	it("pings when what is waiting fell due after the run's publish window", async () => {
		const events = heartbeat();
		emdash.runScheduledTasks.mockImplementation(async () => {
			vi.setSystemTime(NOW + 100_000);
			return { published: [] };
		});
		emdash.scheduled.set("news", [{ id: "01NEWS", title: "Later", scheduledAt: ago(-90_000) }]);
		await cron();
		expect(events).toEqual([`ping ${PING}`]);
	});

	it("sends no heartbeat when the overdue check cannot run", async () => {
		const events = heartbeat();
		emdash.runtimeError = new Error("EmDash is not configured");
		expect(await cron()).toBe("resolved");
		expect(events).toEqual([]);
		expect(logged("error")).toEqual([
			{ level: "error", event: "scheduler.check_failed", error: "Error: EmDash is not configured" },
		]);
	});

	it("checks nothing on the runs that send no heartbeat", async () => {
		heartbeat();
		emdash.runtimeError = new Error("no database");
		await cron(TOP_OF_HOUR + 60_000);
		expect(logged("error")).toEqual([]);
	});
});

const PUBLIC = { "Cloudflare-CDN-Cache-Control": "public, max-age=900", "Cache-Tag": "news" };

/** The cache headers the Worker hands Cloudflare for a request EmDash answered with `answer`. */
async function served(answer: Response, headers: HeadersInit = {}) {
	emdash.page.mockReturnValue(answer);
	const request = new Request("https://findlaymason.org/news", { headers });
	const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} };
	const response: unknown = await Reflect.apply(Reflect.get(worker, "fetch"), worker, [
		request,
		{},
		ctx,
	]);
	if (!(response instanceof Response)) throw new Error("the Worker answered with no Response");
	return [
		response.headers.get("cloudflare-cdn-cache-control"),
		response.headers.get("cache-control"),
	];
}

describe("what Cloudflare's cache may store (M7 review L1)", () => {
	it("never shares a response that sets a cookie, whatever the route asked for", async () => {
		const answer = new Response("page", { headers: { ...PUBLIC, "Set-Cookie": "bookmark=1" } });
		expect(await served(answer)).toEqual(["no-store", "private, no-store"]);
	});

	it("never shares the answer to a request that carried credentials", async () => {
		const answer = new Response("page", { headers: PUBLIC });
		expect(await served(answer, { Authorization: "Bearer token" })).toEqual([
			"no-store",
			"private, no-store",
		]);
	});

	it("leaves a visitor's public page cacheable", async () => {
		expect(await served(new Response("page", { headers: PUBLIC }))).toEqual([
			"public, max-age=900",
			null,
		]);
	});
});
