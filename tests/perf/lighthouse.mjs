// Lighthouse on the public pages the budget names (constitution amendment 1: at least 90 in
// Performance, Accessibility, Best Practices and SEO). Run it against a production build, under
// `wrangler dev` or a deployed environment, never the dev server, whose unbundled modules make
// Performance meaningless:
//
//   CHROME_PATH=<chromium> node tests/perf/lighthouse.mjs <base URL> [runs per page]
//
// Each page runs `runs` times (default 3) with Lighthouse's mobile defaults; the table shows the
// median score per category and the lowest, and the script fails when a median is under 90.
// The JSON reports land in the system temp folder, under lighthouse-reports/.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIGHTHOUSE = "lighthouse@13.6.0";
const PAGES = ["/", "/bodies/blue-lodge", "/calendar", "/news"];
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const BUDGET = 90;

const [base, count = "3"] = process.argv.slice(2);
if (!base) {
	console.error("usage: CHROME_PATH=<chromium> node tests/perf/lighthouse.mjs <base URL> [runs]");
	process.exit(2);
}
const runs = Number(count);
const outDir = join(tmpdir(), "lighthouse-reports");
mkdirSync(outDir, { recursive: true });

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [];
const failures = [];
const audits = new Map();
for (const page of PAGES) {
	const scores = Object.fromEntries(CATEGORIES.map((category) => [category, []]));
	for (let run = 1; run <= runs; run += 1) {
		const file = join(outDir, `${page.replaceAll("/", "_") || "_"}.${run}.json`);
		execFileSync(
			"pnpm",
			[
				"dlx",
				LIGHTHOUSE,
				new URL(page, base).href,
				"--quiet",
				"--output=json",
				`--output-path=${file}`,
				`--only-categories=${CATEGORIES.join(",")}`,
				"--chrome-flags=--headless=new --no-sandbox --ignore-certificate-errors",
			],
			{ stdio: ["ignore", "ignore", "inherit"] },
		);
		const report = JSON.parse(readFileSync(file, "utf8"));
		for (const category of CATEGORIES) {
			scores[category].push(Math.round((report.categories[category]?.score ?? 0) * 100));
		}
		// Audits below a full score, for the reason a category is not 100.
		for (const audit of Object.values(report.audits)) {
			if (typeof audit.score === "number" && audit.score < 0.9 && audit.scoreDisplayMode !== "informative") {
				audits.set(`${page} ${audit.id}`, `${audit.title}${audit.displayValue ? ` (${audit.displayValue})` : ""}`);
			}
		}
	}
	const cells = CATEGORIES.map((category) => {
		const m = median(scores[category]);
		if (m < BUDGET) failures.push(`${page} ${category} ${m}`);
		return `${m} (min ${Math.min(...scores[category])})`;
	});
	rows.push(`| ${page} | ${cells.join(" | ")} |`);
}

console.log(`Lighthouse ${LIGHTHOUSE.split("@")[1]}, mobile defaults, median of ${runs} runs per page, against ${base}`);
console.log(`| Page | ${CATEGORIES.join(" | ")} |`);
console.log(`| --- | ${CATEGORIES.map(() => "---").join(" | ")} |`);
for (const row of rows) console.log(row);
if (audits.size > 0) {
	console.log("\nAudits under 0.9:");
	for (const [key, title] of audits) console.log(`- ${key}: ${title}`);
}
if (failures.length > 0) {
	console.error(`\nUnder ${BUDGET}: ${failures.join(", ")}`);
	process.exitCode = 1;
}
