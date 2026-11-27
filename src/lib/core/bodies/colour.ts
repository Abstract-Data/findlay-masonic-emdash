import type { BodyType } from "../acl/officer-titles";

/**
 * FR-4.4: the six identity colours a body can wear, as an editor picks them in the admin. A
 * fixed list, so no choice can fail contrast; `src/styles/theme.css` holds each one's light and
 * dark value, and the newsletter theme its email value.
 */
export const BODY_COLOURS = ["Blue", "Red", "Purple", "Slate", "Green", "Brown"] as const;

export type BodyColour = (typeof BODY_COLOURS)[number];

/** The value of `data-colour`, which theme.css maps to `--body-<key>`. */
export const COLOUR_KEY: Readonly<Record<BodyColour, string>> = {
	Blue: "blue",
	Red: "red",
	Purple: "purple",
	Slate: "slate",
	Green: "green",
	Brown: "brown",
};

/** The colour members already know each body by, used until an editor picks another. */
export const DEFAULT_COLOUR: Readonly<Record<BodyType, BodyColour>> = {
	"Blue Lodge": "Blue",
	Chapter: "Red",
	Council: "Purple",
	Commandery: "Slate",
	"Order of the Eastern Star": "Green",
	"Temple Board": "Brown",
};

/** The body's chosen colour, else its type's default; null when neither is known. */
export function bodyColour(raw: unknown, bodyType: BodyType | null): BodyColour | null {
	const chosen = BODY_COLOURS.find((colour) => colour === raw);
	if (chosen !== undefined) return chosen;
	return bodyType === null ? null : DEFAULT_COLOUR[bodyType];
}
