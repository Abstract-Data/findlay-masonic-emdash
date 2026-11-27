import type { Page } from "@playwright/test";
import { expect, test } from "../body-access";
import { BODY_NAMES, storageStatePath, type SignedInRole } from "../roles";

async function bodyField(page: Page) {
	await page.goto("/_emdash/admin/content/news/new");
	const field = page.getByTestId("body-field");
	await expect(field).toBeVisible({ timeout: 150_000 });
	return field;
}

const editors: readonly (readonly [SignedInRole, string])[] = [
	["blue-lodge", BODY_NAMES["blue-lodge"]],
	["chapter", BODY_NAMES.chapter],
];

for (const [role, name] of editors) {
	test.describe(`body field (${role})`, () => {
		test.use({ storageState: storageStatePath(role) });

		test("offers only the editor's body and preselects it (FR-5.5)", async ({ page, bodies }) => {
			test.setTimeout(240_000);
			const field = await bodyField(page);
			await expect(field.locator("option")).toHaveText(["Choose a body", name]);
			await expect(field).toHaveValue(role === "chapter" ? bodies.chapter : bodies["blue-lodge"]);
		});
	});
}

test.describe("body field (unassigned-editor)", () => {
	test.use({ storageState: storageStatePath("unassigned-editor") });

	test("offers no body to an Editor without a grant (FR-5.6)", async ({ page }) => {
		test.setTimeout(240_000);
		const field = await bodyField(page);
		await expect(field.locator("option")).toHaveText(["Choose a body"]);
		await expect(field).toHaveValue("");
	});
});

test.describe("body field (admin)", () => {
	test.use({ storageState: storageStatePath("admin") });

	test("offers every body to an Admin (FR-5.7)", async ({ page }) => {
		test.setTimeout(240_000);
		const field = await bodyField(page);
		await expect(field.locator("option")).toHaveCount(7);
		await expect(field).toHaveValue("");
	});
});
