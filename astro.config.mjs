import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, envField, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { Features } from "lightningcss";

// Vitest loads this config through getViteConfig() in plain Node, where the
// adapter's workerd runner cannot start. Unit tests cover the pure core only.
const isVitest = process.env.VITEST === "true";

export default defineConfig({
	output: "server",
	adapter: isVitest ? undefined : cloudflare(),
	env: {
		// Every field stays optional until the milestone that uses it.
		schema: {
			RESEND_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
			TURNSTILE_SECRET: envField.string({ context: "server", access: "secret", optional: true }),
			GOOGLE_CLIENT_SECRET: envField.string({
				context: "server",
				access: "secret",
				optional: true,
			}),
			MICROSOFT_CLIENT_SECRET: envField.string({
				context: "server",
				access: "secret",
				optional: true,
			}),
			RESEND_SEGMENT_ID: envField.string({ context: "server", access: "public", optional: true }),
			RESEND_NEWSLETTER_TOPIC_ID: envField.string({
				context: "server",
				access: "public",
				optional: true,
			}),
			GOOGLE_CLIENT_ID: envField.string({ context: "server", access: "public", optional: true }),
			MICROSOFT_CLIENT_ID: envField.string({ context: "server", access: "public", optional: true }),
			NEWSLETTER_TEST_ALLOWLIST: envField.string({
				context: "server",
				access: "public",
				optional: true,
			}),
			TURNSTILE_SITE_KEY: envField.string({ context: "client", access: "public", optional: true }),
		},
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	vite: {
		css: {
			// Keep light-dark() native so the footer theme switcher works in
			// production. For older browsers, Lightning CSS otherwise rewrites
			// it into variables that follow only prefers-color-scheme, which the
			// :root.light / :root.dark color-scheme rules in Base.astro can't
			// reach. Browsers without light-dark() get the light fallback in
			// tokens.css.
			lightningcss: { exclude: Features.LightDark },
		},
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto", coalesce: true }),
			storage: r2({ binding: "MEDIA" }),
			// portless serves dev over HTTPS at a named .localhost origin and sets
			// PORTLESS_URL. Passkeys, CSRF and redirects need that public origin,
			// not the proxied 127.0.0.1 address. Unset in builds.
			...(process.env.PORTLESS_URL ? { siteUrl: process.env.PORTLESS_URL } : {}),
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
