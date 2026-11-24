import { fileURLToPath } from "node:url";
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
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
const newsletter = (file) =>
	fileURLToPath(new URL(`./src/plugins/newsletter/${file}`, import.meta.url));

export default defineConfig({
	output: "server",
	adapter: isVitest ? undefined : cloudflare(),
	// Route caching on Cloudflare's Worker cache (M7). Only a response a route marks cacheable
	// (src/lib/adapters/site/cache.ts) is stored; the adapter sends every other one with
	// Cloudflare-CDN-Cache-Control: no-store, and src/middleware.ts opts out any response for a
	// signed-in user or one that sets a cookie. Publishing purges the pages' cache tags.
	...(isVitest ? {} : { cache: { provider: cacheCloudflare() } }),
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
			// Worker variables set per environment after the build: "secret" is how astro:env
			// reads a value from the runtime env instead of inlining it at build time.
			RESEND_SEGMENT_ID: envField.string({ context: "server", access: "secret", optional: true }),
			RESEND_NEWSLETTER_TOPIC_ID: envField.string({
				context: "server",
				access: "secret",
				optional: true,
			}),
			GOOGLE_CLIENT_ID: envField.string({ context: "server", access: "public", optional: true }),
			MICROSOFT_CLIENT_ID: envField.string({ context: "server", access: "public", optional: true }),
			// A directory (tenant) ID; EmDash treats only its sign-ins as verified emails.
			MICROSOFT_TENANT_ID: envField.string({ context: "server", access: "public", optional: true }),
			NEWSLETTER_TEST_ALLOWLIST: envField.string({
				context: "server",
				access: "secret",
				optional: true,
			}),
			// The sender of newsletters and system email, on the Resend-verified domain.
			RESEND_FROM: envField.string({ context: "server", access: "secret", optional: true }),
			// Dev server only: use the in-memory Resend fake even when RESEND_API_KEY is set.
			// Builds ignore it (src/plugins/newsletter/runtime.ts).
			RESEND_FAKE: envField.boolean({
				context: "server",
				access: "public",
				optional: true,
				default: false,
			}),
			// The Turnstile widget's public site key, a Worker variable like the settings above: only
			// server-rendered forms read it, so it need not be built into the client.
			TURNSTILE_SITE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
			// Which Worker this is: "production" or "staging" (wrangler.jsonc vars). Anything else,
			// unset included, is treated as non-production, where email reaches only the allowlist.
			SITE_ENV: envField.string({ context: "server", access: "secret", optional: true }),
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
				{
					id: "newsletter",
					version: "1.0.0",
					format: "native",
					entrypoint: newsletter("index.ts"),
					adminEntry: newsletter("admin.tsx"),
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
			// Direction C: designed for low-vision readers. One variable file covers 400 to 700.
			provider: fontProviders.google(),
			name: "Atkinson Hyperlegible Next",
			cssVariable: "--font-body",
			weights: ["400 700"],
			fallbacks: ["sans-serif"],
		},
	],
	devToolbar: { enabled: false },
});
