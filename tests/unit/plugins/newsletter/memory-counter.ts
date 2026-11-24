import type { CounterStore } from "@plugins/newsletter/rate-limit";

/** Plugin KV in memory, with its compare-and-set semantics, for the form rate limits. */
export function memoryCounter(): CounterStore & { readonly rows: Map<string, unknown> } {
	const rows = new Map<string, { value: unknown; revision: string }>();
	const values = new Map<string, unknown>();
	let revision = 0;
	return {
		rows: values,
		async getVersioned(key) {
			return rows.get(key) ?? null;
		},
		async compareAndSet(key, expected, value) {
			if ((rows.get(key)?.revision ?? null) !== expected) return { applied: false };
			revision += 1;
			rows.set(key, { value, revision: String(revision) });
			values.set(key, value);
			return { applied: true };
		},
	};
}
