import type { CounterStore } from "@plugins/newsletter/rate-limit";

/** Plugin KV in memory, with its compare-and-set semantics, for the form rate limits. */
export function memoryCounter(): CounterStore & { readonly rows: ReadonlyMap<string, unknown> } {
	const rows = new Map<string, { value: unknown; revision: string }>();
	let revision = 0;
	return {
		get rows() {
			return new Map([...rows].map(([key, row]) => [key, row.value]));
		},
		async getVersioned(key) {
			return rows.get(key) ?? null;
		},
		async compareAndSet(key, expected, value) {
			if ((rows.get(key)?.revision ?? null) !== expected) return { applied: false };
			revision += 1;
			rows.set(key, { value, revision: String(revision) });
			return { applied: true };
		},
		async compareAndDelete(key, expected) {
			if (rows.get(key)?.revision !== expected) return { applied: false };
			rows.delete(key);
			return { applied: true };
		},
		async list(prefix) {
			return [...rows]
				.filter(([key]) => key.startsWith(prefix))
				.map(([key, row]) => ({ key, value: row.value }));
		},
	};
}
