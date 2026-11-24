// One local part, one @, a dotted domain; nothing that separates, quotes or names a second
// address (commas, semicolons, angle brackets, quotes, whitespace).
const SINGLE_ADDRESS = /^[^\s@<>,;:"'()[\]\\]+@[^\s@<>,;:"'()[\]\\]+\.[^\s@<>,;:"'()[\]\\]+$/u;

/** `raw` trimmed, when it is exactly one bare email address; otherwise null. */
export function parseAddress(raw: string): string | null {
	const address = raw.trim();
	return SINGLE_ADDRESS.test(address) ? address : null;
}
