// Checks a production build (`pnpm astro build`) for what must never ship. Run after the build:
//   node tests/build/check-dist.mjs
// 1. The browser bundle carries no Resend SDK and no key-shaped secret (constitution
//    § Newsletter and email, § Secrets and configuration).
// 2. The server bundle carries no development fake and no dev-only route: they exist only under
//    `astro dev` (src/plugins/newsletter/runtime.ts). The SDK fingerprints must be found in the
//    server bundle, which shows the scan can see what it looks for.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SDK = [/api\.resend\.com/, /resend-node:/];
const KEYS = [
	/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}\b/,
	/\b0x4AAAAAAA[A-Za-z0-9_-]{20,}\b/,
	/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/,
	/-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const FAKE_MARKER = /findlay-dev-fake-mailer/;
const DEV_ROUTE = /"dev\/outbox"/;

// Source maps embed the original sources, so a key or the fake reaching them is caught too.
const TEXT = /\.(?:m?js|css|html|json|txt|xml|svg|map)$/;
function files(dir) {
	return readdirSync(dir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && TEXT.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));
}

function matching(list, pattern) {
	return list.filter((file) => pattern.test(readFileSync(file, "utf8")));
}

const client = files("dist/client");
const server = files("dist/server");
const failures = [];
const check = (label, found, expectFound = false) => {
	const ok = expectFound ? found.length > 0 : found.length === 0;
	console.log(
		`${ok ? "ok  " : "FAIL"} ${label}: ${found.length} file(s)${found.length ? ` ${found.slice(0, 3).join(", ")}` : ""}`,
	);
	if (!ok) failures.push(label);
};

const maps = [...client, ...server].filter((file) => file.endsWith(".map")).length;
console.log(
	`scanned ${client.length} client and ${server.length} server files, ${maps} of them source maps`,
);
for (const pattern of SDK) check(`client has no Resend SDK ${pattern}`, matching(client, pattern));
for (const pattern of KEYS)
	check(`client has no key shaped like ${pattern}`, matching(client, pattern));
for (const pattern of KEYS)
	check(`server has no key shaped like ${pattern}`, matching(server, pattern));
check("server has no dev fake (FAKE_MARKER)", matching(server, FAKE_MARKER));
// Code only: routes.ts's source, which a map embeds, declares the route inside its DEV branch.
check(
	"server has no dev-only outbox route",
	matching(
		server.filter((file) => !file.endsWith(".map")),
		DEV_ROUTE,
	),
);
for (const pattern of SDK)
	check(`server has the Resend SDK ${pattern} (scan sees it)`, matching(server, pattern), true);

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed`);
	process.exit(1);
}
console.log("\nall dist checks passed");
