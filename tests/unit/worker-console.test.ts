import { describe, expect, it, vi } from "vitest";

// What reaches Workers Logs: the console as it is when src/worker.ts has loaded. The capture is
// installed first, as the runtime's console is, and the Worker wraps whatever it finds.
const written = vi.hoisted(() => {
	const lines: unknown[][] = [];
	for (const level of ["debug", "log", "info", "warn", "error"] as const) {
		Reflect.set(console, level, (...args: unknown[]) => lines.push(args));
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
