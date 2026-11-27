import type { APIRequestContext, Page } from "@playwright/test";
import {
	NEWS,
	createNews,
	data,
	expect,
	expectRejected,
	failure,
	newsData,
	test,
} from "../body-access";
import { ACCOUNTS, BODY_NAMES, storageStatePath } from "../roles";

const GRANTS = "/_emdash/api/plugins/body-access";

async function grantedBodies(client: APIRequestContext): Promise<string[]> {
	const mine = await data<{ bodies: { id: string; granted: boolean }[] }>(
		client.get(`${GRANTS}/my-bodies`),
	);
	return mine.bodies.filter((body) => body.granted).map((body) => body.id);
}

async function openBodyAccess(page: Page): Promise<void> {
	await page.goto("/_emdash/admin");
	await page
		.getByRole("complementary", { name: "Admin navigation" })
		.getByRole("link", { name: "Body Access" })
		.click({ timeout: 150_000 });
}

test.describe("FR-5.1 Body Access page (Admin)", () => {
	test.use({ storageState: storageStatePath("admin") });

	test("an Admin grants and revokes a body, and the user's next request follows", async ({
		page,
		as,
		bodies,
	}) => {
		test.setTimeout(240_000);
		const target = await as("grant-target");
		await openBodyAccess(page);
		const row = page.getByTestId(`grants-${ACCOUNTS["grant-target"].email}`);
		const chapter = row.getByRole("checkbox", { name: `${BODY_NAMES.chapter} for` });
		const save = async () => {
			await row.getByRole("button", { name: "Save" }).click();
			await expect(row.getByRole("status")).toHaveText("Saved");
		};

		await chapter.check();
		await save();
		expect(await grantedBodies(target)).toEqual([bodies.chapter]);
		await createNews(target, bodies.chapter);

		await chapter.uncheck();
		await save();
		expect(await grantedBodies(target)).toEqual([]);
		await expectRejected(
			target.post(NEWS, { data: { data: newsData(bodies.chapter) } }),
			"SAVE_REJECTED",
			BODY_NAMES.chapter,
		);
	});
});

test.describe("Body Access page (Editor)", () => {
	test.use({ storageState: storageStatePath("blue-lodge") });

	test("is refused to an Editor in the admin and at its API", async ({ page, as, bodies }) => {
		test.setTimeout(240_000);
		await openBodyAccess(page);
		await expect(page.getByTestId("body-access-denied")).toContainText(
			"Only Temple administrators can manage body access.",
		);
		await expect(page.getByTestId("body-access")).toHaveCount(0);

		const lodge = await as("blue-lodge");
		await failure(lodge.get(`${GRANTS}/grants/list`), 403);
		const me = await data<{ id: string }>(lodge.get("/_emdash/api/auth/me"));
		await failure(
			lodge.post(`${GRANTS}/grants/set`, { data: { userId: me.id, bodyIds: [bodies.chapter] } }),
			403,
		);
		expect(await grantedBodies(lodge)).toEqual([bodies["blue-lodge"]]);
	});
});
