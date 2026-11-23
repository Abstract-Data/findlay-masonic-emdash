// ESLint runs only the two Astro template rules Oxlint cannot cover.
import astro from "eslint-plugin-astro";

export default [
	{
		ignores: ["dist/**", ".astro/**", ".wrangler/**", "reference/**", "node_modules/**"],
	},
	...astro.configs["flat/base"],
	{
		files: ["**/*.astro"],
		rules: {
			"astro/no-set-html-directive": "error",
			"astro/no-unsafe-inline-scripts": "error",
		},
	},
];
