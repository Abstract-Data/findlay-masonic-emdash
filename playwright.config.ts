import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { storageStatePath } from "./tests/e2e/roles";

// portless owns the dev URL (named .localhost, plus a branch label in git
// worktrees), so ask it rather than hardcoding a host or port.
const pkg: unknown = JSON.parse(readFileSync("package.json", "utf8"));
const portlessName: unknown =
	typeof pkg === "object" && pkg !== null
		? Reflect.get(Reflect.get(pkg, "portless") ?? {}, "name")
		: undefined;
if (typeof portlessName !== "string") throw new Error("package.json has no portless.name");
const baseURL =
	process.env.E2E_BASE_URL ??
	execFileSync("pnpm", ["exec", "portless", "get", portlessName], {
		encoding: "utf8",
	}).trim();

export default defineConfig({
	testDir: "tests/e2e",
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL,
		// portless signs .localhost with its own local CA, which Chromium's
		// NSS store does not trust.
		ignoreHTTPSErrors: true,
		trace: "on-first-retry",
	},
	projects: [
		{ name: "setup", testMatch: /.*\.setup\.ts/ },
		{
			name: "anon",
			testMatch: /(smoke|admin)\.spec\.ts/,
			use: { ...devices["Desktop Chrome"], storageState: storageStatePath("anon") },
			dependencies: ["setup"],
		},
		{
			// Per-role suites: each test signs in with a storage state the setup project wrote.
			name: "roles",
			testDir: "tests/e2e/body-access",
			use: { ...devices["Desktop Chrome"] },
			dependencies: ["setup"],
		},
		{
			// Before any issue is approved, so a fresh database shows the empty archive.
			name: "newsletter-empty",
			testMatch: /newsletter-archive\.empty\.spec\.ts/,
			use: { ...devices["Desktop Chrome"], storageState: storageStatePath("anon") },
			dependencies: ["setup"],
		},
		{
			// The dev server's in-memory Resend and Turnstile fakes stand in for both services.
			name: "newsletter",
			testDir: "tests/e2e/newsletter",
			use: { ...devices["Desktop Chrome"] },
			dependencies: ["setup", "newsletter-empty"],
		},
		{
			// After the builder suite has approved an issue, so the archive has one to show.
			name: "newsletter-archive",
			testMatch: /newsletter-archive\.anon\.spec\.ts/,
			use: { ...devices["Desktop Chrome"], storageState: storageStatePath("anon") },
			dependencies: ["newsletter"],
		},
		{
			// Public pages as a visitor (M4). After the newsletter suite, whose assertions count
			// the emails in the dev outbox that the contact form also writes to.
			name: "public",
			testDir: "tests/e2e/public",
			use: { ...devices["Desktop Chrome"], storageState: storageStatePath("anon") },
			dependencies: ["setup", "newsletter"],
		},
		{
			// The post-deploy checks (@monitor), as a visitor. Setup applies the seed, so the
			// bodies every deployment has exist on a fresh local database too.
			name: "monitor",
			testDir: "tests/e2e/monitor",
			use: { ...devices["Desktop Chrome"], storageState: storageStatePath("anon") },
			dependencies: ["setup"],
		},
		{
			// axe on every public route once the public suite has given its lists content.
			name: "a11y",
			testDir: "tests/e2e/a11y",
			use: { ...devices["Desktop Chrome"] },
			dependencies: ["public"],
		},
		{
			// Screenshots, a busy week's axe scan, and sideways scrolling and spilled calendar entries
			// on every public page at five widths. It seeds sample content, so it runs after every
			// other project.
			name: "visual",
			testDir: "tests/e2e/visual",
			use: { ...devices["Desktop Chrome"], storageState: storageStatePath("anon") },
			dependencies: ["a11y"],
		},
	],
	webServer: {
		// Astro 7 backgrounds `astro dev` when it detects a coding agent, and the
		// detached server loses its portless route mid-run. --ignore-lock keeps
		// it a foreground process that Playwright owns.
		command: "pnpm dev --ignore-lock",
		url: baseURL,
		ignoreHTTPSErrors: true,
		reuseExistingServer: !process.env.CI,
		// Playwright's default SIGKILL stops portless before it can pass the
		// signal on, which orphans the Astro and workerd processes.
		gracefulShutdown: { signal: "SIGINT", timeout: 10_000 },
		timeout: 180_000,
	},
});
