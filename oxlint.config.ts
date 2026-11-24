import { defineConfig } from "oxlint";

// Constitution § Newsletter and email: the Resend SDK and its secret stay on the server.
const RESEND_SDK = {
	regex: "^resend(/.*)?$",
	message: "Only src/lib/adapters/resend-mailer.ts imports the resend SDK.",
};
const RESEND_MAILER = {
	regex: "(^|/)resend-mailer$",
	message:
		"Only the newsletter plugin's server routes and email transport send email; components, pages, admin pages and core never import the mailer.",
};

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
		"no-restricted-imports": ["error", { patterns: [RESEND_SDK, RESEND_MAILER] }],
	},
	overrides: [
		{
			// The newsletter plugin's server modules (routes, transport, service) send email, and
			// send-gate wraps the mailer they use; the plugin's .tsx admin modules run in the
			// browser and stay under the default ban.
			files: [
				"src/plugins/newsletter/*.ts",
				"src/lib/adapters/dev-fakes.ts",
				"src/lib/adapters/send-gate.ts",
				"tests/**",
			],
			rules: { "no-restricted-imports": ["error", { patterns: [RESEND_SDK] }] },
		},
		{
			files: ["src/lib/adapters/resend-mailer.ts"],
			rules: { "no-restricted-imports": "off" },
		},
		{
			// Constitution: the pure core has no framework, SDK or runtime imports.
			files: ["src/lib/core/**"],
			rules: {
				"no-restricted-imports": [
					"error",
					{
						patterns: [
							{
								// A regex, because glob groups miss subpaths such as astro:env/server.
								regex:
									"^(emdash|resend|astro)(/.*)?$|^@emdash-cms/|^(astro|node|cloudflare):|^@(adapters|plugins)/|resend-mailer$",
								message:
									"src/lib/core is pure: parse EmDash data and call Resend, Astro and runtime APIs from src/lib/adapters.",
							},
						],
					},
				],
			},
		},
	],
});
