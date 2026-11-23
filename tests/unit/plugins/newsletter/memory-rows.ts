import type { IssueRows, StoredIssue } from "@adapters/newsletter/issues";

type Where = Record<string, string | { in: string[] }>;

const fieldOf = (data: unknown, key: string): unknown =>
	typeof data === "object" && data !== null ? Reflect.get(data, key) : undefined;
const sortKey = (data: unknown, key: string): string => {
	const value = fieldOf(data, key);
	return typeof value === "string" ? value : "";
};

/**
 * EmDash plugin storage in memory, with its compare-and-set semantics: a write applies only when
 * the row's revision is still the one the caller read. Rows go through JSON, as in D1.
 */
export class MemoryRows implements IssueRows {
	readonly rows = new Map<string, { json: string; revision: string }>();
	private counter = 0;
	private writes = 0;
	/** The 1-based number of the write (counted from now) that throws, as a crash would. */
	private crashAt: number | null = null;

	crashOnWrite(n: number): void {
		this.writes = 0;
		this.crashAt = n;
	}

	async getVersioned(id: string) {
		const row = this.rows.get(id);
		if (row === undefined) return null;
		const value: unknown = JSON.parse(row.json);
		return { value, revision: row.revision };
	}

	async compareAndSet(id: string, expected: string | null, data: StoredIssue) {
		this.writes += 1;
		if (this.writes === this.crashAt) {
			this.crashAt = null;
			throw new Error("storage went away");
		}
		const row = this.rows.get(id);
		const current = row?.revision ?? null;
		if (current !== expected) return { applied: false };
		this.counter += 1;
		this.rows.set(id, { json: JSON.stringify(data), revision: `rev-${this.counter}` });
		return { applied: true };
	}

	async compareAndDelete(id: string, expected: string) {
		if (this.rows.get(id)?.revision !== expected) return { applied: false };
		this.rows.delete(id);
		return { applied: true };
	}

	async query(options: {
		where?: Where;
		orderBy?: Record<string, "asc" | "desc">;
		limit?: number;
	}) {
		const matches = (data: unknown) =>
			Object.entries(options.where ?? {}).every(([key, rule]) => {
				const value = fieldOf(data, key);
				return typeof rule === "string"
					? value === rule
					: typeof value === "string" && rule.in.includes(value);
			});
		const [order] = Object.entries(options.orderBy ?? {});
		const items = [...this.rows]
			.map(([id, row]) => {
				const data: unknown = JSON.parse(row.json);
				return { id, data };
			})
			.filter((item) => matches(item.data))
			.toSorted((a, b) => {
				if (order === undefined) return 0;
				const [key, direction] = order;
				const compared = sortKey(a.data, key).localeCompare(sortKey(b.data, key));
				return direction === "desc" ? -compared : compared;
			});
		return { items: items.slice(0, options.limit ?? 50) };
	}
}
