export const ROLES = [
	"anon",
	"admin",
	"blue-lodge",
	"chapter",
	"unassigned-editor",
	"peer-lodge",
	"two-body",
	"grant-target",
	"council",
] as const;

export type Role = (typeof ROLES)[number];
export type SignedInRole = Exclude<Role, "anon">;

export function storageStatePath(role: Role): string {
	return `tests/e2e/.auth/${role}.json`;
}

const EDITOR = 40;

interface Account {
	readonly email: string;
	readonly name: string;
	readonly role: number;
	readonly bodies: readonly string[];
}

/**
 * The accounts the setup project signs in, by role. Body grants are seed slugs. The Admin keeps
 * EmDash's dev-bypass address, so a rerun on the same database signs the same Admin back in.
 */
export const ACCOUNTS: Readonly<Record<SignedInRole, Account>> = {
	admin: { email: "dev@emdash.local", name: "Dev Admin", role: 50, bodies: [] },
	"blue-lodge": {
		email: "lodge@test.local",
		name: "Lodge Secretary",
		role: EDITOR,
		bodies: ["blue-lodge"],
	},
	chapter: {
		email: "chapter@test.local",
		name: "Chapter Secretary",
		role: EDITOR,
		bodies: ["chapter"],
	},
	"unassigned-editor": {
		email: "unassigned@test.local",
		name: "New Editor",
		role: EDITOR,
		bodies: [],
	},
	"peer-lodge": {
		email: "lodge-peer@test.local",
		name: "Lodge Treasurer",
		role: EDITOR,
		bodies: ["blue-lodge"],
	},
	"two-body": {
		email: "two-body@test.local",
		name: "Lodge and Chapter Editor",
		role: EDITOR,
		bodies: ["blue-lodge", "chapter"],
	},
	"grant-target": {
		email: "grant-target@test.local",
		name: "Incoming Secretary",
		role: EDITOR,
		bodies: [],
	},
	council: {
		email: "council@test.local",
		name: "Council Recorder",
		role: EDITOR,
		bodies: ["council"],
	},
};

export const BODY_NAMES = {
	"blue-lodge": "Findlay Lodge No. 227",
	chapter: "Findlay Chapter No. 58",
} as const;
