// Builds the site with a unique sentinel in every astro:env setting a deployed Worker reads at
// runtime, then fails if any sentinel is in the bundle: a value there was fixed at build time,
// and a Worker variable set later would never be read. Run from the repository root:
//   node tests/build/check-runtime-env.mjs
// TURNSTILE_SITE_KEY is the control: a client value is inlined, so its sentinel must be found,
// which shows the build received the sentinels and the scan can see them.
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
];
const INLINED = ["TURNSTILE_SITE_KEY"];

const sentinels = new Map(
	[...RUNTIME, ...INLINED].map((name) => [name, `sentinel-${randomUUID()}`]),
);
const outDir = mkdtempSync(join(tmpdir(), "runtime-env-build-"));
// The build points Wrangler's deploy redirect at its outDir; put back the one for dist/.
const REDIRECT = ".wrangler/deploy/config.json";
const redirect = existsSync(REDIRECT) ? readFileSync(REDIRECT, "utf8") : null;

try {
	execFileSync("pnpm", ["astro", "build", "--outDir", outDir], {
		stdio: ["ignore", "ignore", "inherit"],
		env: { ...process.env, ...Object.fromEntries(sentinels) },
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
