import type { Page } from "@playwright/test";
import { data, expect, failure, test, unique } from "../body-access";
import { discardOpenDrafts, FAKE, NEWSLETTER_API, outbox, publishedNews } from "../newsletter";
import { BODY_NAMES, storageStatePath } from "../roles";

async function openNewsletter(page: Page): Promise<void> {
	await page.goto("/_emdash/admin");
	await page
		.getByRole("complementary", { name: "Admin navigation" })
		.getByRole("link", { name: "Newsletter" })
		.click({ timeout: 150_000 });
	await expect(page.getByTestId("newsletter")).toBeVisible({ timeout: 60_000 });
}

test.describe("newsletter builder (Admin, FR-6)", () => {
	test.use({ storageState: storageStatePath("admin") });

	test("builds an issue per body, refuses an untested edit, test-sends, approves once and archives it", async ({
		page,
		as,
		bodies,
	}) => {
		test.setTimeout(300_000);
		const admin = await as("admin");
		await discardOpenDrafts(admin);
		const lodgeNews = unique("Lodge degree night");
		const chapterNews = unique("Chapter installation");
		await publishedNews(admin, bodies["blue-lodge"], lodgeNews);
		await publishedNews(admin, bodies.chapter, chapterNews);
		const before = await outbox(admin);

		// FR-6.1, 6.2: one section per body, in body order, loaded into the email editor.
		await openNewsletter(page);
		await page.getByRole("button", { name: "New issue" }).click();
		const issue = page.getByTestId("newsletter-issue");
		await expect(issue).toBeVisible({ timeout: 60_000 });
		const sections = issue.getByTestId("newsletter-sections").getByRole("listitem");
		const headings = await sections.allTextContents();
		expect(headings).toContain(BODY_NAMES["blue-lodge"]);
		expect(headings).toContain(BODY_NAMES.chapter);
		expect(headings.indexOf(BODY_NAMES["blue-lodge"])).toBeLessThan(
			headings.indexOf(BODY_NAMES.chapter),
		);
		const editor = issue.getByTestId("newsletter-editor");
		await expect(editor.locator(".fm-article-card", { hasText: lodgeNews })).toBeVisible();
		await expect(editor.locator(".fm-article-card", { hasText: chapterNews })).toBeVisible();

		// FR-6.3: edit inside the editor and save.
		const lodgeHeading = editor.locator("section.fm-body-section h2", {
			hasText: BODY_NAMES["blue-lodge"],
		});
		await lodgeHeading.click();
		await page.keyboard.press("End");
		await page.keyboard.type(", spring news");
		const status = issue.getByTestId("newsletter-status");
		await issue.getByRole("button", { name: "Save" }).click();
		await expect(status).toHaveText(/^Saved version \d+\.$/);

		// FR-6.6: no test send since the edit, so approval is refused and nothing is created.
		await issue.getByRole("button", { name: "Approve and send" }).click();
		await expect(status).toContainText("Send a test of the current version before approving");
		expect((await outbox(admin)).createCalls).toBe(before.createCalls);

		// FR-6.4: the test goes to the allowlist only, with the unsubscribe link.
		await issue.getByRole("button", { name: "Send test" }).click();
		await expect(status).toContainText(`Test sent to ${FAKE.allowlist.join(", ")}`);
		const tested = await outbox(admin);
		const testEmail = tested.emails.at(-1);
		expect(tested.emails).toHaveLength(before.emails.length + 1);
		expect(testEmail?.to).toEqual(FAKE.allowlist);
		expect(testEmail?.subject).toMatch(/^\[Test\] /);
		expect(testEmail?.hasUnsubscribeLink).toBe(true);

		// FR-6.5, 6.7: approval creates exactly one broadcast to the Segment under the Topic.
		await issue.getByRole("button", { name: "Approve and send" }).click();
		await expect(status).toHaveText("Approved and sent to subscribers.");
		const sent = await outbox(admin);
		expect(sent.createCalls).toBe(before.createCalls + 1);
		const broadcast = sent.broadcasts.at(-1);
		expect(broadcast).toMatchObject({
			segmentId: FAKE.segment,
			topicId: FAKE.topic,
			hasUnsubscribeLink: true,
		});
		expect(broadcast?.name).toMatch(/^fm-issue:[0-9a-f-]{36}:rev:\d+$/);

		// A second approval of the same issue is refused and creates nothing.
		const { issues } = await data<{ issues: { id: string; revision: number; status: string }[] }>(
			admin.get(`${NEWSLETTER_API}/issues/list`),
		);
		const approved = issues.find((candidate) => broadcast?.name.includes(candidate.id));
		expect(approved?.status).toBe("sent");
		const again = await failure(
			admin.post(`${NEWSLETTER_API}/issues/approve`, {
				data: { id: approved?.id, revision: approved?.revision },
			}),
			409,
		);
		expect(again.code).toBe("NOT_DRAFT");
		expect((await outbox(admin)).createCalls).toBe(before.createCalls + 1);

		// FR-6.8: the archive shows the sent email, edit included, in a sandboxed frame.
		await issue.getByRole("link", { name: "View in the archive" }).click();
		const frame = page.getByTestId("newsletter-email");
		await expect(frame).toHaveAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
		await expect(
			page.frameLocator('[data-testid="newsletter-email"]').locator("body"),
		).toContainText(`${BODY_NAMES["blue-lodge"]}, spring news`);
		await expect(
			page.frameLocator('[data-testid="newsletter-email"]').locator("body"),
		).toContainText("Get the next issue by email");
	});
});
