import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import { storageStatePath } from "./tests/e2e/roles";

// portless owns the dev URL (named .localhost, plus a branch label in git
// worktrees), so ask it rather than hardcoding a host or port.
const baseURL =
	process.env.E2E_BASE_URL ??
	execFileSync("pnpm", ["exec", "portless", "get", "findlay-masonic"], {
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
			use: { ...devices["Desktop Chrome"], storageState: storageStatePath("anon") },
			dependencies: ["setup"],
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
