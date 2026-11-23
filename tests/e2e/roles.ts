export const ROLES = ["anon", "admin", "blue-lodge", "chapter", "unassigned-editor"] as const;

export type Role = (typeof ROLES)[number];

export function storageStatePath(role: Role): string {
	return `tests/e2e/.auth/${role}.json`;
}
