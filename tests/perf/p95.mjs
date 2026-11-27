// A local indicator of server time per public route, not the NFR measurement: the budget
// (P95 < 300 ms on cached pages) is measured in production through Axiom in M7. Server time is
// EmDash's `Server-Timing: mw` (total middleware, the whole render); wall time adds the local
// proxy and the network.
//
//   node tests/perf/p95.mjs <base URL> [requests per route]
//
// For a portless dev URL, trust its local CA: NODE_EXTRA_CA_CERTS=~/.portless/ca.pem.
/* oxlint-disable no-await-in-loop -- requests are timed one at a time, so none queues behind another. */
const [base, count = "50"] = process.argv.slice(2);
if (!base) {
	console.error("usage: node tests/perf/p95.mjs <base URL> [requests per route]");
	process.exit(2);
}
const runs = Number(count);
const month = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" })
	.format(new Date())
	.slice(0, 7);

const ROUTES = [
	"/",
	"/bodies",
	"/bodies/commandery",
	"/bodies/eastern-star/news",
	"/news",
	`/calendar?month=${month}`,
	`/bodies/eastern-star/calendar?month=${month}`,
	"/calendar.ics",
	"/bodies/eastern-star/calendar.ics",
	"/pages/about",
	"/newsletters",
];
const WARM_UP = 3;

function percentile(sorted, p) {
	return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function ms(value) {
	return value === undefined ? "n/a" : value.toFixed(0);
}

async function timed(url) {
	const start = performance.now();
	const response = await fetch(url, { redirect: "manual" });
	await response.arrayBuffer();
	const wall = performance.now() - start;
	const header = response.headers.get("server-timing") ?? "";
	const server = Number(/(?:^|,\s*)mw;dur=([\d.]+)/.exec(header)?.[1] ?? Number.NaN);
	return { status: response.status, wall, server };
}

console.log(`${runs} requests per route after ${WARM_UP} warm-up requests, against ${base}`);
console.log("| Route | Status | Server P50 ms | Server P95 ms | Wall P50 ms | Wall P95 ms |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const route of ROUTES) {
	const url = new URL(route, base).href;
	for (let i = 0; i < WARM_UP; i += 1) await timed(url);
	const samples = [];
	for (let i = 0; i < runs; i += 1) samples.push(await timed(url));
	const server = samples
		.map((s) => s.server)
		.filter(Number.isFinite)
		.toSorted((a, b) => a - b);
	const wall = samples.map((s) => s.wall).toSorted((a, b) => a - b);
	const statuses = [...new Set(samples.map((s) => s.status))].join(",");
	console.log(
		`| ${route} | ${statuses} | ${ms(percentile(server, 50))} | ${ms(percentile(server, 95))} | ${ms(percentile(wall, 50))} | ${ms(percentile(wall, 95))} |`,
	);
}
