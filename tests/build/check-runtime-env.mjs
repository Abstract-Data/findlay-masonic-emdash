// Builds the site with a unique sentinel in every astro:env setting a deployed Worker reads at
// runtime, then fails if any sentinel is in the bundle: a value there was fixed at build time,
// and a Worker variable set later would never be read. Run from the repository root:
//   node tests/build/check-runtime-env.mjs
// PORTLESS_URL is the control: astro.config.mjs passes it to EmDash's siteUrl, which the build
// writes into the bundle, so its sentinel must be found. That shows the build received the
// sentinels and the scan can see them. (No astro:env field is inlined any more: every public
// server field the code imports is a boolean.)
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RUNTIME = [
	"RESEND_API_KEY",
	"RESEND_FROM",
	"RESEND_SEGMENT_ID",
	"RESEND_NEWSLETTER_TOPIC_ID",
	"NEWSLETTER_TEST_ALLOWLIST",
	"TURNSTILE_SECRET",
	"TURNSTILE_SITE_KEY",
];
const INLINED = ["PORTLESS_URL"];

const sentinels = new Map(
	[...RUNTIME, ...INLINED].map((name) => [name, `sentinel-${randomUUID()}`]),
);
// siteUrl must parse as a URL, so the control's sentinel goes in as a host name.
const buildValue = (name, sentinel) =>
	INLINED.includes(name) ? `https://${sentinel}.invalid` : sentinel;
const outDir = mkdtempSync(join(tmpdir(), "runtime-env-build-"));
// The build points Wrangler's deploy redirect at its outDir; put back the one for dist/.
const REDIRECT = ".wrangler/deploy/config.json";
const redirect = existsSync(REDIRECT) ? readFileSync(REDIRECT, "utf8") : null;

try {
	execFileSync("pnpm", ["astro", "build", "--outDir", outDir], {
		stdio: ["ignore", "ignore", "inherit"],
		env: {
			...process.env,
			...Object.fromEntries([...sentinels].map(([name, value]) => [name, buildValue(name, value)])),
		},
	});
	const files = readdirSync(outDir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && /\.(?:m?js|map|json|html|css)$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));
	const holding = (value) =>
		files
			.filter((file) => readFileSync(file, "utf8").includes(value))
			.map((file) => file.slice(outDir.length + 1));

	const failures = [];
	for (const name of RUNTIME) {
		const found = holding(sentinels.get(name));
		console.log(
			`${found.length === 0 ? "ok  " : "FAIL"} ${name} is read at runtime, not inlined${found.length ? `: ${found.slice(0, 3).join(", ")}` : ""}`,
		);
		if (found.length > 0) failures.push(name);
	}
	for (const name of INLINED) {
		const found = holding(sentinels.get(name));
		console.log(
			`${found.length > 0 ? "ok  " : "FAIL"} ${name} is inlined at build (control): ${found.length} file(s)`,
		);
		if (found.length === 0) failures.push(name);
	}
	console.log(`\nscanned ${files.length} files`);
	if (failures.length > 0) {
		console.error(`${failures.length} check(s) failed: ${failures.join(", ")}`);
		process.exitCode = 1;
	} else {
		console.log("all runtime env checks passed");
	}
} finally {
	rmSync(outDir, { recursive: true, force: true });
	if (redirect === null) rmSync(REDIRECT, { force: true });
	else writeFileSync(REDIRECT, redirect);
}
