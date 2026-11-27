import { expect, test as setup, type APIRequestContext } from "@playwright/test";
import { API_HEADERS, data } from "./body-access";
import { ACCOUNTS, storageStatePath, type SignedInRole } from "./roles";

// EmDash's dev-only bypass signs in whoever holds DEV_EMAIL, creating an Admin there when no
// one does. Each account borrows that address for one sign-in while the Admin steps aside, so
// one database serves every role and a rerun finds the same users. DEV-only: production has
// no bypass, and staging sign-in goes through invites (docs/runbooks/onboard-body-editor.md).
const DEV_EMAIL = ACCOUNTS.admin.email;
const PARKED_EMAIL = "admin-parked@test.local";

setup("anon", async ({ page }) => {
	await page.goto("/");
	await page.context().storageState({ path: storageStatePath("anon") });
});

setup("signed-in roles", async ({ playwright, baseURL }) => {
	// The first API call compiles EmDash's routes on a cold dev server.
	setup.setTimeout(300_000);
	const fresh = async () =>
		playwright.request.newContext({
			baseURL,
			ignoreHTTPSErrors: true,
			extraHTTPHeaders: { ...API_HEADERS, Origin: new URL(baseURL ?? "").origin },
		});

	const admin = await fresh();
	// Applies the seed on a fresh database, then signs in DEV_EMAIL.
	await data(admin.get("/_emdash/api/setup/dev-bypass"));
	const adminId = (await data<{ id: string }>(admin.get("/_emdash/api/auth/me"))).id;
	await dismissWelcome(admin);
	const bodies = await data<{ items: { id: string; slug: string }[] }>(
		admin.get("/_emdash/api/content/bodies?limit=50"),
	);
	const bodyId = (slug: string) => {
		const found = bodies.items.find((item) => item.slug === slug);
		expect(found, `seeded body ${slug}`).toBeDefined();
		return found?.id ?? "";
	};
	const setEmail = async (id: string, email: string, more: { name?: string; role?: number } = {}) =>
		data(admin.put(`/_emdash/api/admin/users/${id}`, { data: { email, ...more } }));
	const userByEmail = async (email: string) => {
		const found = await data<{ items: { id: string; email: string }[] }>(
			admin.get(`/_emdash/api/admin/users?search=${encodeURIComponent(email)}`),
		);
		return found.items.find((user) => user.email === email);
	};

	const signIn = async (role: SignedInRole) => {
		const account = ACCOUNTS[role];
		await setEmail(adminId, PARKED_EMAIL);
		const existing = await userByEmail(account.email);
		if (existing) await setEmail(existing.id, DEV_EMAIL);
		const client = await fresh();
		await data(client.get("/_emdash/api/auth/dev-bypass"));
		const { id } = await data<{ id: string }>(client.get("/_emdash/api/auth/me"));
		await setEmail(id, account.email, { name: account.name, role: account.role });
		await setEmail(adminId, DEV_EMAIL);
		await data(
			admin.post("/_emdash/api/plugins/body-access/grants/set", {
				data: { userId: id, bodyIds: account.bodies.map(bodyId) },
			}),
		);
		const me = await data<{ email: string; role: number }>(client.get("/_emdash/api/auth/me"));
		expect(me).toMatchObject({ email: account.email, role: account.role });
		await dismissWelcome(client);
		await client.storageState({ path: storageStatePath(role) });
		await client.dispose();
	};
	await inSequence(
		Object.keys(ACCOUNTS).filter((role): role is SignedInRole => role !== "admin"),
		signIn,
	);
	await admin.storageState({ path: storageStatePath("admin") });
	await admin.dispose();
});

async function dismissWelcome(client: APIRequestContext): Promise<void> {
	await data(client.post("/_emdash/api/auth/me", { data: { action: "dismissWelcome" } }));
}

/** One at a time: every account borrows the same dev-bypass address to sign in. */
async function inSequence<T>(items: readonly T[], run: (item: T) => Promise<void>): Promise<void> {
	const [first, ...rest] = items;
	if (first === undefined) return;
	await run(first);
	await inSequence(rest, run);
}
