import { expect, failure, test } from "../body-access";
import { NEWSLETTER_API } from "../newsletter";
import { storageStatePath } from "../roles";

const ISSUE = "00000000-0000-4000-8000-000000000000";

test.describe("newsletter is Admin-only (Editor, spec Q5)", () => {
	test.use({ storageState: storageStatePath("blue-lodge") });

	test("an Editor sees no builder on the Newsletter page", async ({ page }) => {
		test.setTimeout(240_000);
		await page.goto("/_emdash/admin");
		await page
			.getByRole("complementary", { name: "Admin navigation" })
			.getByRole("link", { name: "Newsletter" })
			.click({ timeout: 150_000 });
		await expect(page.getByTestId("newsletter-denied")).toContainText(
			"Only Temple administrators can build and send the newsletter.",
		);
		await expect(page.getByRole("button", { name: "New issue" })).toHaveCount(0);
	});

	test("every newsletter route refuses an Editor", async ({ as }) => {
		const editor = await as("blue-lodge");
		const calls = [
			editor.get(`${NEWSLETTER_API}/issues/list`),
			editor.get(`${NEWSLETTER_API}/issues/get?id=${ISSUE}`),
			editor.get(`${NEWSLETTER_API}/dev/outbox`),
			editor.post(`${NEWSLETTER_API}/issues/new`, { data: {} }),
			editor.post(`${NEWSLETTER_API}/issues/save`, { data: { id: ISSUE } }),
			editor.post(`${NEWSLETTER_API}/issues/test-send`, { data: { id: ISSUE, revision: 1 } }),
			editor.post(`${NEWSLETTER_API}/issues/approve`, { data: { id: ISSUE, revision: 1 } }),
			editor.post(`${NEWSLETTER_API}/issues/discard`, { data: { id: ISSUE } }),
			editor.post(`${NEWSLETTER_API}/dev/unsubscribe`, { data: { email: "a@example.test" } }),
		];
		for (const call of calls) {
			// oxlint-disable-next-line no-await-in-loop -- each refusal is checked in turn.
			expect((await failure(call, 403)).code).toBe("FORBIDDEN");
		}
	});
});
