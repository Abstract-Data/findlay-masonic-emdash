import { BODY_COLOURS, type BodyColour } from "@core/bodies/colour";
import type { ThemeConfig } from "@react-email/editor/plugins";

/**
 * The newsletter in the site's direction C ("Noticeboard"), in the light palette because email
 * clients do not share the page's colour scheme: the site's canvas and ink, Atkinson Hyperlegible
 * Next where the client has it (Verdana otherwise), and each body's section ruled in its colour
 * above its name. The hex values are the light values in `src/styles/theme.css`.
 */
const INK = "#171717";
const INK_SECONDARY = "#525252";
const BRAND = "#14213d";
const RULE = "#d4d4d4";
const FONT = '"Atkinson Hyperlegible Next", "Atkinson Hyperlegible", Verdana, Arial, sans-serif';

/** FR-4.4 in email: the bar above each body's section. */
export const SECTION_BAR: Readonly<Record<BodyColour, string>> = {
	Blue: "#1d4ed8",
	Red: "#b91c1c",
	Purple: "#6d28d9",
	Slate: "#334155",
	Green: "#047857",
	Brown: "#92400e",
};

export const NEWSLETTER_THEME: ThemeConfig = {
	extends: "basic",
	styles: {
		body: { backgroundColor: "#fafafa", color: INK, fontFamily: FONT },
		container: { backgroundColor: "#ffffff", color: INK, fontFamily: FONT },
		h1: { color: INK, fontFamily: FONT, fontSize: "30px", fontWeight: 700, lineHeight: "1.2" },
		h2: { color: INK, fontFamily: FONT, fontSize: "24px", fontWeight: 700, lineHeight: "1.25" },
		h3: { color: INK, fontFamily: FONT, fontSize: "19px", fontWeight: 700, lineHeight: "1.3" },
		paragraph: { color: INK, fontFamily: FONT, fontSize: "18px", lineHeight: "1.55" },
		listItem: { color: INK, fontFamily: FONT, fontSize: "18px", lineHeight: "1.55" },
		link: { color: BRAND, textDecoration: "underline" },
	},
};

/** The colour of a section's bar: its body's colour, or a neutral rule when it has none. */
export function sectionBar(colour: unknown): string {
	const known = BODY_COLOURS.find((candidate) => candidate === colour);
	return known === undefined ? RULE : SECTION_BAR[known];
}

/** Inline styles for the custom nodes' email output, from the same palette. */
export const NODE_STYLES = {
	section: { padding: "20px 0 8px" },
	card: { margin: "0 0 20px" },
	cardImage: {
		display: "block",
		width: "100%",
		maxWidth: "560px",
		height: "auto",
		borderRadius: "6px",
	},
	cardDate: { margin: "8px 0 4px", fontSize: "15px", color: INK_SECONDARY, fontFamily: FONT },
	cardTitle: {
		margin: "0 0 6px",
		fontSize: "20px",
		lineHeight: "1.3",
		fontWeight: 700,
		color: INK,
		fontFamily: FONT,
	},
	cardLink: { color: INK },
	cardExcerpt: { margin: "0", fontSize: "18px", lineHeight: "1.55", color: INK, fontFamily: FONT },
} as const;
