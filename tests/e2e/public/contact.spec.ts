import { outbox, NEWSLETTER_API } from "../newsletter";
import { BODIES, ensurePage, expect, test, unique, updateBody } from "./site";

// The Council's and the Chapter's contact recipients; the tests build on each other.
test.describe.configure({ mode: "serial" });

const CONTACT = `${NEWSLETTER_API}/contact`;
const TOKEN = { "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" };
const councilSecretary = `${unique("council-secretary")}@example.test`;
const PUBLIC_PAGES = ["/", "/bodies", "/bodies/council", "/pages/contact", "/calendar", "/news"];

test("Q12: a visitor writes to a body, and the email reaches its private recipients", async ({
	page,
	admin,
	ids,
	request,
}) => {
	await ensurePage(admin, "contact", "Contact Us", "Write to any body below.");
	await updateBody(admin, ids.council, { contact_recipients: [{ email: councilSecretary }] });
	const visitor = `${unique("visitor")}@example.test`;

	await page.goto("/bodies/council");
	const form = page.getByTestId("contact-form");
	await form.getByLabel("Your name").fill("Jane Visitor");
	await form.getByLabel("Your email address").fill(visitor);
	await form.getByLabel("Message").fill("When does the Council meet?");
	await form.getByRole("button", { name: "Send message" }).click();
	await expect(page).toHaveURL(/\/bodies\/council\?contact=(sent|rate-limited)#contact$/);
	test.skip(page.url().includes("rate-limited"), "earlier runs this hour used up the limit");
	await expect(page.getByTestId("contact-message")).toHaveText(
		"Thank you. Your message has been sent.",
	);

	const email = (await outbox(admin)).emails.find((sent) => sent.replyTo === visitor);
	expect(email).toMatchObject({
		to: [councilSecretary],
		cc: [],
		replyTo: visitor,
		subject: `Website message for ${BODIES.council} from Jane Visitor`,
	});
	for (const path of PUBLIC_PAGES) {
		// oxlint-disable-next-line no-await-in-loop -- one page at a time.
		const html = await (await request.get(path)).text();
		expect(html, path).not.toContain(councilSecretary);
	}
	expect((await request.get("/_emdash/api/content/bodies")).status()).toBe(401);
});

test("Q12: the Contact page writes to whichever body the visitor picks", async ({
	page,
	admin,
}) => {
	const visitor = `${unique("visitor")}@example.test`;
	await page.goto("/pages/contact");
	const form = page.getByTestId("contact-form");
	const choices = await form
		.getByRole("combobox", { name: "Body" })
		.locator("option")
		.allTextContents();
	expect(choices).toContain(BODIES.council);
	expect(choices).not.toContain(BODIES["temple-board"]);
	await form.getByRole("combobox", { name: "Body" }).selectOption({ label: BODIES.council });
	await form.getByLabel("Your name").fill("John Visitor");
	await form.getByLabel("Your email address").fill(visitor);
	await form.getByLabel("Message").fill("How do I petition?");
	await form.getByRole("button", { name: "Send message" }).click();
	await expect(page).toHaveURL(/\/pages\/contact\?contact=(sent|rate-limited)#contact$/);
	test.skip(page.url().includes("rate-limited"), "earlier runs this hour used up the limit");
	const email = (await outbox(admin)).emails.find((sent) => sent.replyTo === visitor);
	expect(email?.to).toEqual([councilSecretary]);
});

test("Q12: the route refuses other sites and unverified posts, and limits floods", async ({
	admin,
	ids,
	request,
	baseURL,
}) => {
	const chapterSecretary = `${unique("chapter-secretary")}@example.test`;
	await updateBody(admin, ids.chapter, { contact_recipients: [{ email: chapterSecretary }] });
	const site = { Origin: new URL(baseURL ?? "").origin };
	const fields = (extra: Record<string, string> = {}) => ({
		body: ids.chapter,
		name: "Flood",
		email: "flood@example.test",
		message: "Hello",
		from: "/bodies/chapter",
		...TOKEN,
		...extra,
	});
	const outcome = async (form: Record<string, string>, headers: Record<string, string>) => {
		const response = await request.post(CONTACT, { form, headers, maxRedirects: 0 });
		return response.status() === 303
			? new URL(response.headers().location ?? "", baseURL).searchParams.get("contact")
			: response.status();
	};

	expect(await outcome(fields(), { Origin: "https://evil.example" })).toBe(403);
	expect(await outcome(fields(), {})).toBe(403);
	expect(await outcome(fields({ "cf-turnstile-response": "" }), site)).toBe("verification-failed");
	expect(await outcome(fields({ email: "not-an-address" }), site)).toBe("invalid");
	expect(await outcome(fields({ body: ids["temple-board"] }), site)).toBe("unavailable");

	const outcomes = [];
	for (let i = 0; i < 6; i += 1) {
		// oxlint-disable-next-line no-await-in-loop -- the limit counts posts in order.
		outcomes.push(await outcome(fields(), site));
	}
	expect(outcomes.at(-1)).toBe("rate-limited");
	const sent = outcomes.filter((o) => o === "sent").length;
	expect(sent).toBeLessThanOrEqual(5);
	expect(outcomes.slice(sent).every((o) => o === "rate-limited")).toBe(true);
	const delivered = (await outbox(admin)).emails.filter((e) => e.to.includes(chapterSecretary));
	expect(delivered).toHaveLength(sent);
});
