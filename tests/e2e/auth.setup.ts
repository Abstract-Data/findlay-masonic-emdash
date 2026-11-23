import { test as setup } from "@playwright/test";
import { ROLES, storageStatePath } from "./roles";

setup("anon", async ({ page }) => {
	await page.goto("/");
	await page.context().storageState({ path: storageStatePath("anon") });
});

for (const role of ROLES.filter((r) => r !== "anon")) {
	setup(role, () => {
		setup.skip(true, "Sign-in per role arrives with auth and body-access in M3.");
	});
}
