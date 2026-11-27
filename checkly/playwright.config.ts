import { defineConfig, devices } from "@playwright/test";

// The Playwright configuration Checkly runs the @monitor checks with (checkly.config.ts). Unlike
// the repository's own config it starts no dev server and signs nobody in: it visits the
// deployed site Checkly names in ENVIRONMENT_URL, or the production address.
export default defineConfig({
	testDir: "../tests/e2e/monitor",
	retries: 1,
	use: {
		...devices["Desktop Chrome"],
		baseURL: process.env.ENVIRONMENT_URL ?? "https://findlaymason.org",
		trace: "retain-on-failure",
	},
});
