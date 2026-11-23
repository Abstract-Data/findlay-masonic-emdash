import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, envField, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { google } from "emdash/auth/providers/google";
import { microsoft } from "emdash/auth/providers/microsoft";
import { Features } from "lightningcss";

// Vitest loads this config through getViteConfig() in plain Node, where the
// adapter's workerd runner cannot start. Unit tests cover the pure core only.
const isVitest = process.env.VITEST === "true";

// EmDash imports a native plugin's modules from a generated virtual module, so
// the paths are absolute.
const bodyAccess = (file) =>
	fileURLToPath(new URL(`./src/plugins/body-access/${file}`, import.meta.url));

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
			// A directory (tenant) ID; EmDash treats only its sign-ins as verified emails.
			MICROSOFT_TENANT_ID: envField.string({ context: "server", access: "public", optional: true }),
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
		optimizeDeps: {
			// The Google and Microsoft sign-in buttons (emdash/auth/providers/*-admin)
			// ship as source that imports @cloudflare/kumo, which EmDash only
			// pre-bundles inside its admin. Unbundled, every admin page in dev loads
			// kumo module by module and Vite re-optimizes and reloads mid-session.
			include: ["emdash > @emdash-cms/admin > @cloudflare/kumo"],
		},
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
			// FR-8.2: passkeys stay on; these link existing users by verified email.
			authProviders: [google(), microsoft()],
			plugins: [
				{
					id: "body-access",
					version: "1.0.0",
					format: "native",
					entrypoint: bodyAccess("index.ts"),
					adminEntry: bodyAccess("admin.tsx"),
				},
			],
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
