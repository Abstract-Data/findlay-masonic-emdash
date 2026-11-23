// ESLint covers what Oxlint cannot read: the two Astro template rules, and the Resend import
// ban (oxlint.config.ts) in .astro frontmatter.
import { configs } from "eslint-plugin-astro";

export default [
	{
		ignores: [
			"dist/**",
			".astro/**",
			".wrangler/**",
			"reference/**",
			"node_modules/**",
			"coverage/**",
			"playwright-report/**",
			"test-results/**",
		],
	},
	...configs["flat/base"],
	{
		files: ["**/*.astro"],
		rules: {
			"astro/no-set-html-directive": "error",
			"astro/no-unsafe-inline-scripts": "error",
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							regex: "^resend(/.*)?$|(^|/)resend-mailer$",
							message:
								"Pages and components never send email: only the newsletter plugin's server routes and transport use Resend.",
						},
					],
				},
			],
		},
	},
];
