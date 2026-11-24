// Serves the production build under `wrangler dev` on an empty database and checks, route class
// by route class, what the Worker tells Cloudflare's cache: public pages and feeds are stored
// for their expiry and tagged for purging; the admin, the API, previews, form posts, errors, any
// request carrying a session or a bearer token, and any response that sets a cookie are never
// stored. Run from the repository root after
// `pnpm astro build`:
//   node tests/build/check-cache-headers.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CDN = "cloudflare-cdn-cache-control";
const stored = (maxAge) => (h) =>
	h.get(CDN) === `public, max-age=${maxAge}` && (h.get("cache-tag") ?? "") !== "";
const notStored = (h) => h.get(CDN) === "no-store";
const privateToo = (h) => notStored(h) && h.get("cache-control") === "private, no-store";

/** Seconds to the next midnight on Findlay's wall clock. */
function untilMidnight() {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		hourCycle: "h23",
		hour: "numeric",
		minute: "numeric",
		second: "numeric",
	}).formatToParts(new Date());
	const part = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return 24 * 60 * 60 - (part("hour") * 3600 + part("minute") * 60 + part("second"));
}

// Fifteen minutes, or less in the quarter hour before midnight in Findlay (src/lib/adapters/site/cache.ts).
const clockBound = (h) => {
	const maxAge = Number(/^public, max-age=(\d+)$/.exec(h.get(CDN) ?? "")?.[1] ?? Number.NaN);
	const expected = Math.min(900, untilMidnight());
	return Math.abs(maxAge - expected) <= 2 && (h.get("cache-tag") ?? "") !== "";
};

const SESSION = { cookie: "astro-session=any" };
// Cloudflare's cache stores a response to a request with Authorization when it says `public`.
const BEARER = { authorization: "Bearer not-a-real-token" };
const CHECKS = [
	{ kind: "clock-bound page", method: "GET", path: "/", expected: clockBound },
	{ kind: "clock-bound page", method: "GET", path: "/calendar", expected: clockBound },
	{ kind: "content page", method: "GET", path: "/news", expected: stored(3600) },
	{ kind: "ICS feed", method: "GET", path: "/calendar.ics", expected: stored(3600) },
	{ kind: "newsletter archive", method: "GET", path: "/newsletters", expected: stored(300) },
	{ kind: "admin", method: "GET", path: "/_emdash/admin", expected: notStored },
	{ kind: "API", method: "GET", path: "/_emdash/api/manifest", expected: notStored },
	{ kind: "API", method: "GET", path: "/_emdash/api/search?q=lodge", expected: notStored },
	{ kind: "preview", method: "GET", path: "/?_preview=not-a-token", expected: notStored },
	{ kind: "signed-in visitor", method: "GET", path: "/", headers: SESSION, expected: privateToo },
	{ kind: "bearer token", method: "GET", path: "/", headers: BEARER, expected: privateToo },
	{ kind: "bearer token", method: "GET", path: "/news", headers: BEARER, expected: privateToo },
	{
		kind: "signed-in visitor",
		method: "GET",
		path: "/calendar.ics",
		headers: SESSION,
		expected: privateToo,
	},
	{
		kind: "form post",
		method: "POST",
		path: "/_emdash/api/plugins/newsletter/contact",
		expected: notStored,
	},
	{ kind: "not found", method: "GET", path: "/no-such-page", expected: notStored },
];

async function freePort() {
	return new Promise((resolve) => {
		const server = createServer();
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

const port = await freePort();
const state = mkdtempSync(join(tmpdir(), "cache-headers-"));
const worker = spawn(
	"pnpm",
	["exec", "wrangler", "dev", "-c", "dist/server/wrangler.json", "--ip", "127.0.0.1"].concat([
		"--port",
		String(port),
		"--persist-to",
		state,
		"--show-interactive-dev-session=false",
	]),
	{ stdio: ["ignore", "pipe", "pipe"], detached: true },
);
let output = "";
worker.stdout.on("data", (chunk) => (output += chunk));
worker.stderr.on("data", (chunk) => (output += chunk));
const base = `http://127.0.0.1:${port}`;

try {
	const deadline = Date.now() + 90_000;
	for (;;) {
		// oxlint-disable-next-line no-await-in-loop -- poll until the Worker answers.
		const up = await fetch(base, { redirect: "manual" }).then(
			() => true,
			() => false,
		);
		if (up) break;
		if (Date.now() > deadline) throw new Error(`wrangler dev did not start:\n${output}`);
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	// The first request runs EmDash's migrations; check a warm Worker.
	await fetch(new URL("/", base)).then((r) => r.arrayBuffer());

	const failures = [];
	for (const { kind, method, path, headers = {}, expected } of CHECKS) {
		// oxlint-disable-next-line no-await-in-loop -- one request at a time, in order.
		const response = await fetch(new URL(path, base), { method, headers, redirect: "manual" });
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await response.arrayBuffer();
		// Whatever the route, a response that sets a cookie belongs to one visitor.
		const setsCookie = response.headers.has("set-cookie");
		const ok = expected(response.headers) && (!setsCookie || privateToo(response.headers));
		const seen = `${response.status} ${CDN}: ${response.headers.get(CDN)}; cache-control: ${response.headers.get("cache-control")}${setsCookie ? "; set-cookie" : ""}`;
		console.log(`${ok ? "ok  " : "FAIL"} ${kind.padEnd(18)} ${method} ${path.padEnd(42)} ${seen}`);
		if (!ok) failures.push(`${method} ${path}`);
	}
	if (failures.length > 0) {
		console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
		process.exitCode = 1;
	} else {
		console.log(`\nall ${CHECKS.length} cache header checks passed`);
	}
} finally {
	if (worker.pid !== undefined) process.kill(-worker.pid, "SIGINT");
	rmSync(state, { recursive: true, force: true });
}
