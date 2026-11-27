/**
 * The entry a table holds under `key`, a value from outside such as a URL parameter. Only the
 * table's own keys count, so "constructor", "__proto__" or "toString" find nothing rather than
 * something every object inherits.
 */
export function ownEntry<V>(table: Readonly<Record<string, V>>, key: string | null): V | undefined {
	return key !== null && Object.hasOwn(table, key) ? table[key] : undefined;
}
