// One local part, one @, a dotted domain; nothing that separates, quotes or names a second
// address (commas, semicolons, angle brackets, quotes, whitespace).
const SINGLE_ADDRESS = /^[^\s@<>,;:"'()[\]\\]+@[^\s@<>,;:"'()[\]\\]+\.[^\s@<>,;:"'()[\]\\]+$/u;

// A display name, quoted or not, then one bracketed part: `Secretary <secretary@example.org>`.
// The name holds no @, bracket or separator, so it cannot carry a second address.
const NAMED = /^(?:"[^"\\<>@]*"\s*|[^"<>@,;]*)<([^<>]*)>$/u;

/** `raw` trimmed, when it is exactly one bare email address; otherwise null. */
export function parseAddress(raw: string): string | null {
	const address = raw.trim();
	return SINGLE_ADDRESS.test(address) ? address : null;
}

/** The one address in `raw`, bare or as `Name <address>`; null for anything else. */
export function parseMailbox(raw: string): string | null {
	const bare = parseAddress(raw);
	if (bare !== null) return bare;
	const inner = NAMED.exec(raw.trim())?.[1];
	return inner === undefined ? null : parseAddress(inner);
}
