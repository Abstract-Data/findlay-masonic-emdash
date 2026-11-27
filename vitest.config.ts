/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
	test: {
		include: ["tests/unit/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/lib/**"],
			reporter: [["text", { skipFull: false }], "html", "json-summary"],
			reportsDirectory: "coverage",
			// PLAN M2 exit check: the grant policy and recurrence rules are fully branch-covered.
			thresholds: {
				"src/lib/core/acl/**": { branches: 100, functions: 100, lines: 100, statements: 100 },
				"src/lib/core/recurrence/**": {
					branches: 100,
					functions: 100,
					lines: 100,
					statements: 100,
				},
			},
		},
	},
});
