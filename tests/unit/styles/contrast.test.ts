import { readFileSync } from "node:fs";
import { BODY_COLOURS, COLOUR_KEY } from "@core/bodies/colour";
import { describe, expect, it } from "vitest";
import { SECTION_BAR } from "@plugins/newsletter/theme";

// WCAG 2.1 AA for direction C, from the stylesheets themselves: 4.5:1 for text, 3:1 for bars,
// swatches, tiles' edges and control borders (1.4.3, 1.4.11). theme.css overrides tokens.css.
type Scheme = "light" | "dark";
type Rgb = readonly [number, number, number];

const LIGHT_DARK = /--([a-z0-9-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/g;

function palette(): ReadonlyMap<string, Record<Scheme, string>> {
	const tokens = new Map<string, Record<Scheme, string>>();
	for (const file of ["src/styles/tokens.css", "src/styles/theme.css"]) {
		for (const [, name = "", light = "", dark = ""] of readFileSync(file, "utf8").matchAll(
			LIGHT_DARK,
		)) {
			tokens.set(name, { light, dark });
		}
	}
	return tokens;
}

const TOKENS = palette();

function token(name: string, scheme: Scheme): Rgb {
	const hex = TOKENS.get(name)?.[scheme];
	if (hex === undefined) throw new Error(`no light-dark() value for --${name}`);
	return rgb(hex);
}

function rgb(hex: string): Rgb {
	const channel = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
	return [channel(1), channel(3), channel(5)];
}

function linear(c: number): number {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: Rgb): number {
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function ratio(a: Rgb, b: Rgb): number {
	const [x, y] = [luminance(a), luminance(b)];
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** color-mix(in srgb, <colour> 12%, <base>): an entry's tint. */
function mix(c: number, b: number): number {
	return Math.round(0.12 * c + 0.88 * b);
}

function tint(colour: Rgb, base: Rgb): Rgb {
	return [mix(colour[0], base[0]), mix(colour[1], base[1]), mix(colour[2], base[2])];
}

const SCHEMES: readonly Scheme[] = ["light", "dark"];
const BODIES = BODY_COLOURS.map((colour) => `body-${COLOUR_KEY[colour]}`);

/** Every pair below the minimum, as "fg on bg (scheme): ratio". */
function failures(
	pairs: readonly (readonly [string, string | ((s: Scheme) => Rgb), number])[],
): string[] {
	return SCHEMES.flatMap((scheme) =>
		pairs.flatMap(([fg, bg, minimum]) => {
			const back = typeof bg === "string" ? token(bg, scheme) : bg(scheme);
			const found = ratio(token(fg, scheme), back);
			const label = typeof bg === "string" ? bg : "tint";
			return found >= minimum ? [] : [`${fg} on ${label} (${scheme}): ${found.toFixed(2)}`];
		}),
	);
}

describe("direction C contrast (WCAG 2.1 AA)", () => {
	it("reads every token the checks name from the stylesheets", () => {
		const names = ["color-text", "color-brand", "on-body", "color-control-border", ...BODIES];
		expect(names.filter((name) => !TOKENS.has(name))).toEqual([]);
	});

	it("gives text 4.5:1 on the canvas, surfaces and fills", () => {
		const text = ["color-text", "color-text-secondary", "color-muted", "color-brand"];
		const grounds = ["color-bg", "color-surface"];
		expect(
			failures([
				...text.flatMap((fg) => grounds.map((bg) => [fg, bg, 4.5] as const)),
				["color-text-secondary", "color-fill", 4.5],
				["color-on-brand", "color-brand", 4.5],
			]),
		).toEqual([]);
	});

	it("gives a date tile's words 4.5:1 on every body colour", () => {
		expect(failures(BODIES.map((body) => ["on-body", body, 4.5] as const))).toEqual([]);
	});

	it("gives a calendar entry's title and time 4.5:1 on its body's tint", () => {
		expect(
			failures(
				BODIES.flatMap((body) =>
					["color-text", "color-text-secondary"].map(
						(fg) =>
							[
								fg,
								(scheme: Scheme) => tint(token(body, scheme), token("color-surface", scheme)),
								4.5,
							] as const,
					),
				),
			),
		).toEqual([]);
	});

	it("gives bars, swatches, focus rings and field borders 3:1 against the page", () => {
		const marks = [...BODIES, "color-brand", "color-control-border"];
		expect(
			failures(
				marks.flatMap((fg) => ["color-bg", "color-surface"].map((bg) => [fg, bg, 3] as const)),
			),
		).toEqual([]);
	});

	it("rules each newsletter section in its body's light colour, 3:1 on the white email", () => {
		const light = BODY_COLOURS.map((colour) => TOKENS.get(`body-${COLOUR_KEY[colour]}`)?.light);
		expect(BODY_COLOURS.map((colour) => SECTION_BAR[colour])).toEqual(light);
		const white = rgb("#ffffff");
		const faint = BODY_COLOURS.filter((colour) => ratio(rgb(SECTION_BAR[colour]), white) < 3);
		expect(faint).toEqual([]);
	});
});
