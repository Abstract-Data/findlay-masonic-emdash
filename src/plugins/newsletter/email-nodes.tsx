import { CARD_ATTR_DEFAULTS, NODE, SECTION_ATTR_DEFAULTS } from "@core/newsletter/nodes";
import { EmailNode } from "@react-email/editor/core";
import { StarterKit } from "@react-email/editor/extensions";
import { EmailTheming } from "@react-email/editor/plugins";
import type { ReactElement } from "react";
import { NEWSLETTER_THEME, NODE_STYLES, sectionBar } from "./theme";

/** "imageSrc" to "data-image-src". */
const dataName = (name: string) =>
	`data-${name.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** TipTap attribute specs round-tripping each core attribute through a data-* attribute. */
function attributes(defaults: Readonly<Record<string, string | null>>) {
	return Object.fromEntries(
		Object.entries(defaults).map(([name, fallback]) => [
			name,
			{
				default: fallback,
				parseHTML: (element: HTMLElement) => element.getAttribute(dataName(name)) ?? fallback,
				renderHTML: (attrs: Record<string, unknown>) => {
					const value = attrs[name];
					return typeof value === "string" ? { [dataName(name)]: value } : {};
				},
			},
		]),
	);
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** Only web links reach an email; anything else renders as plain text. */
function webUrl(value: unknown): string | null {
	if (typeof value !== "string" || !URL.canParse(value)) return null;
	return /^https?:$/.test(new URL(value).protocol) ? value : null;
}

/** One body's section (FR-6.2): a heading, its article cards and its events. */
export const BodySection = EmailNode.create({
	name: NODE.section,
	group: "block",
	content: "block+",
	defining: true,
	addAttributes: () => attributes(SECTION_ATTR_DEFAULTS),
	parseHTML: () => [{ tag: `section[data-type="${NODE.section}"]` }],
	renderHTML: ({ HTMLAttributes }) => [
		"section",
		{ ...HTMLAttributes, "data-type": NODE.section, class: "fm-body-section" },
		0,
	],
	renderToReactEmail: ({ node, children, style }): ReactElement => (
		<table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
			<tbody>
				<tr>
					<td
						style={{
							...style,
							...NODE_STYLES.section,
							borderTop: `4px solid ${sectionBar(node.attrs?.colour)}`,
						}}
					>
						{children}
					</td>
				</tr>
			</tbody>
		</table>
	),
});

/** One news item (FR-6.2). Its text comes from the article; the Admin moves or removes it. */
export const ArticleCard = EmailNode.create({
	name: NODE.card,
	group: "block",
	atom: true,
	draggable: true,
	selectable: true,
	addAttributes: () => attributes(CARD_ATTR_DEFAULTS),
	parseHTML: () => [{ tag: `div[data-type="${NODE.card}"]` }],
	renderHTML: ({ node, HTMLAttributes }) => [
		"div",
		{ ...HTMLAttributes, "data-type": NODE.card, class: "fm-article-card" },
		["strong", {}, text(node.attrs.title)],
		["p", {}, text(node.attrs.publishedOn)],
		["p", {}, text(node.attrs.excerpt)],
	],
	renderToReactEmail: ({ node, style }): ReactElement => {
		const attrs = node.attrs ?? {};
		const href = webUrl(attrs.href);
		const image = webUrl(attrs.imageSrc);
		const title = text(attrs.title);
		return (
			<table
				role="presentation"
				width="100%"
				cellPadding={0}
				cellSpacing={0}
				border={0}
				style={{ ...style, ...NODE_STYLES.card }}
			>
				<tbody>
					<tr>
						<td>
							{image === null ? null : (
								<img
									src={image}
									alt={text(attrs.imageAlt)}
									width={560}
									style={NODE_STYLES.cardImage}
								/>
							)}
							<p style={NODE_STYLES.cardDate}>{text(attrs.publishedOn)}</p>
							<h3 style={NODE_STYLES.cardTitle}>
								{href === null ? (
									title
								) : (
									<a href={href} style={NODE_STYLES.cardLink}>
										{title}
									</a>
								)}
							</h3>
							<p style={NODE_STYLES.cardExcerpt}>{text(attrs.excerpt)}</p>
						</td>
					</tr>
				</tbody>
			</table>
		);
	},
});

/** The editor's extensions; composeReactEmail serializes with the same list. */
export function emailExtensions() {
	return [
		StarterKit,
		EmailTheming.configure({ theme: NEWSLETTER_THEME }),
		BodySection,
		ArticleCard,
	];
}
