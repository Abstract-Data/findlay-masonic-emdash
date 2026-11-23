import { defineConfig } from "oxlint";

export default defineConfig({
	plugins: ["typescript", "unicorn", "oxc", "import", "vitest"],
	categories: {
		correctness: "error",
		suspicious: "error",
		perf: "warn",
	},
	options: {
		typeAware: true,
	},
	env: {
		browser: true,
		es2024: true,
	},
	ignorePatterns: [
		"dist/**",
		".astro/**",
		".wrangler/**",
		"reference/**",
		"worker-configuration.d.ts",
		"emdash-env.d.ts",
		"playwright-report/**",
		"test-results/**",
		"coverage/**",
	],
	rules: {
		"typescript/no-floating-promises": "error",
		"typescript/no-misused-promises": "error",
		"typescript/await-thenable": "error",
		"typescript/consistent-type-imports": "error",
		"typescript/no-explicit-any": "error",
		"import/no-cycle": "error",
		eqeqeq: "error",
		"import/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
		// Portable Text and EmDash records use _type/_key by spec.
		"no-underscore-dangle": ["error", { allow: ["_type", "_key"] }],
	},
});
