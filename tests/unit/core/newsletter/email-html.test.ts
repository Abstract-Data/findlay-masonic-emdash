import {
	archiveHtml,
	hasUnsubscribeLink,
	issueSlug,
	UNSUBSCRIBE_PLACEHOLDER,
	withFooter,
} from "@core/newsletter/email-html";
import { describe, expect, it } from "vitest";
import { instant, url } from "../../fixtures";

const composed = {
	html: '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Brethren,</p></body></html>',
	text: "Brethren,",
};
const signup = url("https://findlaymason.org/newsletters#signup");
const SUBJECT = "Spring News & <Events>";

describe("withFooter (constitution § Newsletter and email)", () => {
	it("adds the unsubscribe link inside the body and to the text", () => {
		const footed = withFooter(composed, SUBJECT);
		expect(hasUnsubscribeLink(footed.html)).toBe(true);
		expect(footed.html.indexOf(UNSUBSCRIBE_PLACEHOLDER)).toBeLessThan(
			footed.html.indexOf("</body>"),
		);
		expect(footed.text).toContain(
			`Unsubscribe or choose which bodies you hear from: ${UNSUBSCRIBE_PLACEHOLDER}`,
		);
	});

	it("gives the same email when applied twice", () => {
		expect(withFooter(withFooter(composed, SUBJECT), SUBJECT)).toEqual(withFooter(composed, SUBJECT));
	});

	it("appends the footer to HTML that has no body element", () => {
		expect(hasUnsubscribeLink(withFooter({ html: "<p>Hi</p>", text: "Hi" }, SUBJECT).html)).toBe(true);
	});

	it("is the only source of the link: composed HTML without the footer has none", () => {
		expect(hasUnsubscribeLink(composed.html)).toBe(false);
	});

	it("titles the email with its subject, once, however often it is footed", () => {
		const twice = withFooter(withFooter(composed, "Draft"), SUBJECT).html;
		expect(twice).toContain("<head><title>Spring News &amp; &lt;Events></title><meta charset=\"utf-8\">");
		expect(twice.match(/<title>/g)).toHaveLength(1);
	});
});

describe("archiveHtml (FR-6.8)", () => {
	it("swaps the per-recipient unsubscribe footer for a signup link", () => {
		const archived = archiveHtml(withFooter(composed, SUBJECT).html, signup, SUBJECT);
		expect(archived).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
		expect(archived).toContain(`href="${signup}"`);
		expect(archived).toContain("<p>Brethren,</p>");
	});

	it("opens links outside the sandboxed frame", () => {
		expect(archiveHtml(withFooter(composed, SUBJECT).html, signup, SUBJECT)).toContain(
			'<head><base target="_blank"><title>Spring News &amp; &lt;Events></title><meta charset="utf-8">',
		);
	});

	it("replaces a bare placeholder in HTML stored without the footer markers", () => {
		const archived = archiveHtml(`<a href="${UNSUBSCRIBE_PLACEHOLDER}">x</a>`, signup, "Spring");
		expect(archived).toBe(`<base target="_blank"><title>Spring</title><a href="${signup}">x</a>`);
	});
});

describe("issueSlug", () => {
	it("dates the slug in the Temple's time zone and keeps only letters and digits", () => {
		expect(issueSlug("Spring 2027: News & Events!", instant("2027-04-20T02:00:00Z"))).toBe(
			"2027-04-19-spring-2027-news-events",
		);
	});

	it("falls back to 'newsletter' for a subject with no letters or digits", () => {
		expect(issueSlug("✦ ✦ ✦", instant("2027-04-20T14:00:00Z"))).toBe("2027-04-20-newsletter");
	});
});
