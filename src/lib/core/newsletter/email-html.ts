import type { Temporal } from "temporal-polyfill";
import type { AbsoluteUrl } from "../ids";
import { SITE_TZ } from "../time";

/** Resend replaces this with the recipient's hosted preference page in a Broadcast. */
export const UNSUBSCRIBE_PLACEHOLDER = "{{{RESEND_UNSUBSCRIBE_URL}}}";

export interface ComposedEmail {
	readonly html: string;
	readonly text: string;
}

const FOOTER_START = "<!--fm-footer-->";
const FOOTER_END = "<!--/fm-footer-->";
const FOOTER_STYLE =
	'padding:24px 16px;font-family:"Atkinson Hyperlegible Next","Atkinson Hyperlegible",Verdana,Arial,sans-serif;font-size:14px;line-height:1.5;color:#525252;text-align:center';

function footerBlock(inner: string): string {
	return `${FOOTER_START}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto"><tbody><tr><td style="${FOOTER_STYLE}">${inner}</td></tr></tbody></table>${FOOTER_END}`;
}

const SEND_FOOTER = footerBlock(
	`Findlay Masonic Temple. You receive this newsletter because you signed up on our website.<br/><a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#14213d">Unsubscribe or choose which bodies you hear from</a>`,
);

/**
 * Constitution § Newsletter and email: every send carries the unsubscribe link, whatever the
 * Admin's document holds, because the footer is added here and not in the editor. Any footer
 * the HTML already carries is replaced, so composing twice gives the same email. The subject
 * becomes the document's title, which names the email in a browser and to a screen reader.
 */
export function withFooter(email: ComposedEmail, subject: string): ComposedEmail {
	const html = titled(withoutFooter(email.html), subject);
	const at = html.lastIndexOf("</body>");
	const text = email.text.split("\n\n--\n")[0] ?? "";
	return {
		html: at < 0 ? `${html}${SEND_FOOTER}` : `${html.slice(0, at)}${SEND_FOOTER}${html.slice(at)}`,
		text: `${text}\n\n--\nUnsubscribe or choose which bodies you hear from: ${UNSUBSCRIBE_PLACEHOLDER}`,
	};
}

export function hasUnsubscribeLink(html: string): boolean {
	return html.includes(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
}

function withoutFooter(html: string): string {
	const start = html.indexOf(FOOTER_START);
	const end = html.indexOf(FOOTER_END, start);
	return start < 0 || end < 0 ? html : html.slice(0, start) + html.slice(end + FOOTER_END.length);
}

/**
 * FR-6.8: a sent issue as the public archive shows it. The per-recipient unsubscribe footer
 * becomes a link to the signup form, and links open outside the sandboxed frame.
 */
export function archiveHtml(sentHtml: string, signupUrl: AbsoluteUrl, subject: string): string {
	const footer = footerBlock(
		`Findlay Masonic Temple. <a href="${escapeAttribute(signupUrl)}" style="color:#14213d">Get the next issue by email</a>`,
	);
	const start = sentHtml.indexOf(FOOTER_START);
	const end = sentHtml.indexOf(FOOTER_END, start);
	const html =
		start < 0 || end < 0
			? sentHtml.replaceAll(UNSUBSCRIBE_PLACEHOLDER, escapeAttribute(signupUrl))
			: sentHtml.slice(0, start) + footer + sentHtml.slice(end + FOOTER_END.length);
	return inHead(titled(html, subject), '<base target="_blank">');
}

function titled(html: string, subject: string): string {
	const title = `<title>${subject.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</title>`;
	return inHead(html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, ""), title);
}

/** `markup` first in the head, or first in the document when it has none. */
function inHead(html: string, markup: string): string {
	const head = /<head[^>]*>/i.exec(html);
	return head === null
		? `${markup}${html}`
		: `${html.slice(0, head.index + head[0].length)}${markup}${html.slice(head.index + head[0].length)}`;
}

function escapeAttribute(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

const SLUG_MAX = 60;

/** The archive path segment of a sent issue: "2027-04-20-spring-newsletter". */
export function issueSlug(subject: string, at: Temporal.Instant): string {
	const date = at.toZonedDateTimeISO(SITE_TZ).toPlainDate().toString();
	const words = subject
		.normalize("NFKD")
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "")
		.slice(0, SLUG_MAX)
		.replace(/-+$/, "");
	return words === "" ? `${date}-newsletter` : `${date}-${words}`;
}
