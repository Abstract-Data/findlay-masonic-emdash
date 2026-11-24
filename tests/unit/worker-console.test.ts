import { describe, expect, it, vi } from "vitest";

// What reaches Workers Logs: the console as it is when src/worker.ts has loaded. The capture is
// installed first, as the runtime's console is, and the Worker wraps whatever it finds.
const written = vi.hoisted(() => {
	const lines: unknown[][] = [];
	const levels = ["debug", "log", "info", "warn", "error"];
	const others = ["trace", "assert", "group", "groupCollapsed", "dir", "table"];
	for (const method of [...levels, ...others]) {
		Reflect.set(console, method, (...args: unknown[]) => lines.push(args));
	}
	return lines;
});
vi.mock("emdash/middleware", () => ({ runScheduledTasks: async () => ({ published: [] }) }));
vi.mock("cloudflare:workers", () => ({ cache: {} }));
vi.mock("@emdash-cms/cloudflare/worker", () => ({
	default: { fetch: async () => new Response("page") },
	EmDashRoom: {},
	EmDashRoomSite: {},
	PluginBridge: {},
}));
await import("../../src/worker");

const ADDRESS = ["invitee", "example.com"].join("@");

/** The one error argument of the last console call. */
function loggedError(): Error {
	const error = written.at(-1)?.find((part) => part instanceof Error);
	if (!(error instanceof Error)) throw new Error("no error argument was written");
	return error;
}

describe("no email address reaches the Worker's logs (M7 review L2)", () => {
	it("redacts the address EmDash quotes when a delivery fails", () => {
		written.length = 0;
		const error = new Error(`Resend did not accept the email: Invalid to field ${ADDRESS}`);
		console.error(
			`[email:deliver] Provider "newsletter" failed to send email to "${ADDRESS}":`,
			error,
		);
		const text = written
			.flat()
			.map((part) =>
				part instanceof Error ? `${part.message}\n${part.stack ?? ""}` : String(part),
			)
			.join("\n");
		expect(text).toContain('failed to send email to "[email]"');
		expect(text).toContain("Invalid to field [email]");
		expect(text).not.toContain(ADDRESS);
	});

	it.each(["debug", "log", "info", "warn"] as const)("redacts console.%s too", (level) => {
		written.length = 0;
		console[level](`[external-auth] Provisioned user: ${ADDRESS} (role: 30)`);
		expect(written).toEqual([["[external-auth] Provisioned user: [email] (role: 30)"]]);
	});

	it("passes everything else as it was", () => {
		written.length = 0;
		const detail = { keys: ["name"] };
		console.log("[cron] Tick", 3, detail);
		expect(written).toEqual([["[cron] Tick", 3, detail]]);
	});
});

class D1Error extends Error {
	override name = "D1Error";
}

describe("a redacted error keeps what explains it (M7 review round 2)", () => {
	it("keeps the subclass, name, code and stack, with the addresses taken out", () => {
		const error = Object.assign(new D1Error(`no row for ${ADDRESS}`), { code: "SQLITE_ERROR" });
		console.error(error);
		const logged = loggedError();
		expect(logged).toBeInstanceOf(D1Error);
		expect([logged.name, logged.message, Reflect.get(logged, "code")]).toEqual([
			"D1Error",
			"no row for [email]",
			"SQLITE_ERROR",
		]);
		expect(logged.stack).toContain("worker-console.test.ts");
		expect(logged.stack).not.toContain(ADDRESS);
	});

	it("keeps a TypeError a TypeError", () => {
		console.warn(new TypeError(`bad ${ADDRESS}`));
		expect(loggedError()).toBeInstanceOf(TypeError);
	});

	it("redacts the cause chain instead of dropping it", () => {
		const root = new Error(`Resend refused ${ADDRESS}`);
		console.error(
			new Error("delivery failed", { cause: new Error("send failed", { cause: root }) }),
		);
		const cause = loggedError().cause;
		expect(cause).toBeInstanceOf(Error);
		const rootCause = cause instanceof Error ? cause.cause : null;
		expect(rootCause).toBeInstanceOf(Error);
		expect(rootCause instanceof Error ? rootCause.message : "").toBe("Resend refused [email]");
	});

	it("keeps each error of an AggregateError", () => {
		console.error(new AggregateError([new Error(`to ${ADDRESS}`), "plain"], "two failed"));
		const logged = loggedError();
		expect(logged).toBeInstanceOf(AggregateError);
		const errors = logged instanceof AggregateError ? logged.errors : [];
		expect(errors.map((e: unknown) => (e instanceof Error ? e.message : e))).toEqual([
			"to [email]",
			"plain",
		]);
	});
});

describe("what the address pattern leaves alone (M7 review round 2)", () => {
	it("keeps package specifiers and versions", () => {
		written.length = 0;
		console.log("[emdash] @emdash-cms/cloudflare@1.6.0 on astro@7.4.13, node@22.20.5");
		expect(written).toEqual([
			["[emdash] @emdash-cms/cloudflare@1.6.0 on astro@7.4.13, node@22.20.5"],
		]);
	});

	it("still finds addresses on dotted and country domains", () => {
		written.length = 0;
		console.log("to a.b+c@mail.example.co.uk and x@example.org.");
		expect(written).toEqual([["to [email] and [email]."]]);
	});
});

describe("every console method that writes a line (M7 review round 2)", () => {
	it.each(["trace", "group", "groupCollapsed", "dir"] as const)(
		"redacts the strings given to console.%s and passes the rest",
		(method) => {
			written.length = 0;
			const detail = { depth: 1 };
			console[method](`user ${ADDRESS}`, detail);
			expect(written).toEqual([["user [email]", detail]]);
		},
	);

	it("redacts console.assert's message and keeps its condition", () => {
		written.length = 0;
		console.assert(false, `no grant for ${ADDRESS}`);
		expect(written).toEqual([[false, "no grant for [email]"]]);
	});

	it("passes console.table's rows through and redacts a string", () => {
		written.length = 0;
		const rows = [{ id: 1 }];
		console.table(rows, ["id"]);
		console.table(ADDRESS);
		expect(written).toEqual([[rows, ["id"]], ["[email]"]]);
	});
});

describe("redaction time grows with the line, not its square (M7 review round 2)", () => {
	it.each([
		["a run of one letter", "a".repeat(80_000)],
		["an @ before the run", `a@${"a".repeat(80_000)}`],
		["a run of dotted labels", `x@${"a.".repeat(40_000)}`],
	])("redacts 80,000 characters of %s in well under a second", (_, line) => {
		const started = performance.now();
		console.log(line);
		expect(performance.now() - started).toBeLessThan(250);
	});
});
