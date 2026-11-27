import { defineConfig, devices } from "@playwright/test";

// Runs the @monitor checks against a deployed site, after a deploy (docs/runbooks/deploy.md
// § Check). Unlike the repository's own config it starts no dev server and signs nobody in: it
// visits the site named in ENVIRONMENT_URL, or the production address.
export default defineConfig({
	testDir: ".",
	testMatch: "*.spec.ts",
	retries: 1,
	use: {
		...devices["Desktop Chrome"],
		baseURL: process.env.ENVIRONMENT_URL ?? "https://findlaymason.org",
		trace: "retain-on-failure",
	},
});
