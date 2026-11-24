import { defineConfig } from "checkly";
import { Frequency } from "checkly/constructs";

// Synthetic monitoring as code (M7). `pnpm exec checkly test` runs these against the site in
// ENVIRONMENT_URL; `pnpm exec checkly deploy` creates them in the Checkly account. Both need a
// Checkly API key and account id, which a human sets up (docs/runbooks/checkly.md).
export default defineConfig({
	projectName: "Findlay Masonic Temple",
	logicalId: "findlay-masonic",
	repoUrl: "https://github.com/Abstract-Data/findlay-masonic-emdash",
	checks: {
		locations: ["us-east-1", "us-east-2"],
		tags: ["findlay-masonic"],
		checkMatch: "checkly/**/*.check.ts",
		playwrightConfigPath: "./checkly/playwright.config.ts",
		playwrightChecks: [
			{
				name: "Public site: home, a body, calendar, ICS feed, signup",
				logicalId: "public-site-monitor",
				pwTags: ["@monitor"],
				frequency: Frequency.EVERY_10M,
			},
		],
	},
	cli: {
		runLocation: "us-east-1",
	},
});
