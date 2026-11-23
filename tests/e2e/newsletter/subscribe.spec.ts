import type { APIRequestContext } from "@playwright/test";
import { data, expect, test, unique } from "../body-access";
import { FAKE, NEWSLETTER_API, outbox } from "../newsletter";
import { BODY_NAMES, storageStatePath } from "../roles";

const SUBSCRIBE = `${NEWSLETTER_API}/subscribe`;
const CHAPTER_TOPIC = "topic-chapter-e2e";

const address = () => `${unique("visitor")}@example.test`;

async function contact(admin: APIRequestContext, email: string) {
	return (await outbox(admin)).contacts.find((candidate) => candidate.email === email);
}

test.describe("newsletter signup (FR-7)", () => {
	test.use({ storageState: storageStatePath("anon") });

	test.beforeAll(async ({ as, bodies }) => {
		// FR-7.1: the Chapter's Resend Topic, stored on its bodies entry.
		const admin = await as("admin");
		const entry = `/_emdash/api/content/bodies/${bodies.chapter}`;
		await data(admin.put(entry, { data: { data: { resend_topic_id: CHAPTER_TOPIC } } }));
		await data(admin.post(`${entry}/publish`, { data: {} }));
	});

	test("a visitor subscribes with the plain form and lands in the Segment and Topics", async ({
		page,
		as,
	}) => {
		test.setTimeout(240_000);
		const email = address();
		await page.goto("/newsletters");
		const form = page.getByTestId("signup");
		await form.getByLabel("Email address").fill(email);
		await form.getByLabel(BODY_NAMES.chapter).check();
		await form.getByRole("button", { name: "Subscribe" }).click();
		await expect(page).toHaveURL(/\/newsletters\?subscribe=ok#signup$/);
		await expect(page.getByTestId("signup-message")).toHaveText(
			"Thank you. You are subscribed to the newsletter.",
		);
		const saved = await contact(await as("admin"), email);
		expect(saved?.segments).toEqual([FAKE.segment]);
		expect(saved?.topics.toSorted()).toEqual([CHAPTER_TOPIC, FAKE.topic].toSorted());
	});

	test("an address that unsubscribed from all email is told so and stays unsubscribed", async ({
		page,
		as,
	}) => {
		test.setTimeout(240_000);
		const email = address();
		const admin = await as("admin");
		await data(admin.post(`${NEWSLETTER_API}/dev/unsubscribe`, { data: { email } }));
		await page.goto("/newsletters");
		const form = page.getByTestId("signup");
		await form.getByLabel("Email address").fill(email);
		await form.getByLabel(BODY_NAMES.chapter).check();
		await form.getByRole("button", { name: "Subscribe" }).click();
		await expect(page).toHaveURL(/\/newsletters\?subscribe=previously-unsubscribed#signup$/);
		await expect(page.getByTestId("signup-message")).toContainText(
			"This address unsubscribed from the Temple's email before, so it was not added.",
		);
		expect(await contact(admin, email)).toEqual({
			email,
			segments: [],
			topics: [],
			unsubscribed: true,
		});
	});

	test("a post without a Turnstile token is refused and reaches no contact", async ({
		playwright,
		baseURL,
		as,
	}) => {
		const email = address();
		const visitor = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
		const response = await visitor.post(SUBSCRIBE, {
			headers: { Origin: new URL(baseURL ?? "").origin },
			form: { email },
			maxRedirects: 0,
		});
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe("/newsletters?subscribe=verification-failed#signup");
		expect(await contact(await as("admin"), email)).toBeUndefined();
		await visitor.dispose();
	});

	test("a cross-origin post is refused with 403 and reaches no contact (FR-7.2)", async ({
		playwright,
		baseURL,
		as,
	}) => {
		const email = address();
		const visitor = await playwright.request.newContext({ baseURL, ignoreHTTPSErrors: true });
		const response = await visitor.post(SUBSCRIBE, {
			headers: { Origin: "https://evil.example" },
			form: { email, "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" },
			maxRedirects: 0,
		});
		expect(response.status()).toBe(403);
		expect(await contact(await as("admin"), email)).toBeUndefined();
		await visitor.dispose();
	});
});
