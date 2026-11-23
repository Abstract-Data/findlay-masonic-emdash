import type { ThemeConfig } from "@react-email/editor/plugins";

/**
 * Placeholder email theme in the site's neutral tokens (off-white canvas, white card, near-black
 * ink). The M4 design gate replaces it; nothing else in the newsletter reads these values.
 */
export const NEWSLETTER_THEME: ThemeConfig = {
	extends: "basic",
	styles: {
		body: { backgroundColor: "#f6f6f4", color: "#1a1a1a" },
		container: { backgroundColor: "#ffffff", color: "#1a1a1a" },
		h2: { color: "#1a1a1a", fontWeight: 600 },
		h3: { color: "#1a1a1a", fontWeight: 600 },
		paragraph: { color: "#1a1a1a" },
		link: { color: "#1a1a1a", textDecoration: "underline" },
	},
};

/** Inline styles for the custom nodes' email output, from the same tokens. */
export const NODE_STYLES = {
	section: { padding: "16px 0", borderTop: "1px solid #e4e4e0" },
	card: { margin: "0 0 16px" },
	cardImage: {
		display: "block",
		width: "100%",
		maxWidth: "560px",
		height: "auto",
		borderRadius: "8px",
	},
	cardDate: { margin: "8px 0 4px", fontSize: "12px", color: "#5c5c58" },
	cardTitle: { margin: "0 0 4px", fontSize: "18px", lineHeight: "1.3", color: "#1a1a1a" },
	cardLink: { color: "#1a1a1a" },
	cardExcerpt: { margin: "0", color: "#1a1a1a" },
} as const;
