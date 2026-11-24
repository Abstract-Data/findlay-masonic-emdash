// Serves the production build under `wrangler dev` on an empty database and checks, route class
// by route class, what the Worker tells Cloudflare's cache: public pages and feeds are stored
// for their expiry and tagged for purging; the admin, the API, previews, form posts, errors and
// any request carrying a session are never stored. Run from the repository root after
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

const CHECKS = [
	["clock-bound page", "GET", "/", {}, stored(900)],
	["clock-bound page", "GET", "/calendar", {}, stored(900)],
	["content page", "GET", "/news", {}, stored(3600)],
	["ICS feed", "GET", "/calendar.ics", {}, stored(3600)],
	["newsletter archive", "GET", "/newsletters", {}, stored(300)],
	["admin", "GET", "/_emdash/admin", {}, notStored],
	["API", "GET", "/_emdash/api/manifest", {}, notStored],
	["API", "GET", "/_emdash/api/search?q=lodge", {}, notStored],
	["preview", "GET", "/?_preview=not-a-token", {}, notStored],
	["signed-in visitor", "GET", "/", { cookie: "astro-session=any" }, privateToo],
	["signed-in visitor", "GET", "/calendar.ics", { cookie: "astro-session=any" }, privateToo],
	["form post", "POST", "/_emdash/api/plugins/newsletter/contact", {}, notStored],
	["not found", "GET", "/no-such-page", {}, notStored],
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
	["exec", "wrangler", "dev", "-c", "dist/server/wrangler.json", "--ip", "127.0.0.1"]
		.concat(["--port", String(port), "--persist-to", state, "--show-interactive-dev-session=false"]),
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
	for (const [kind, method, path, headers, expected] of CHECKS) {
		// oxlint-disable-next-line no-await-in-loop -- one request at a time, in order.
		const response = await fetch(new URL(path, base), { method, headers, redirect: "manual" });
		// oxlint-disable-next-line no-await-in-loop -- see above.
		await response.arrayBuffer();
		const ok = expected(response.headers);
		const seen = `${response.status} ${CDN}: ${response.headers.get(CDN)}; cache-control: ${response.headers.get("cache-control")}`;
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
	process.kill(-worker.pid, "SIGINT");
	rmSync(state, { recursive: true, force: true });
}
