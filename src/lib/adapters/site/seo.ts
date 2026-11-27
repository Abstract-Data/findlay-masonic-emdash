import { excerpt, type PortableTextBlock } from "@core/newsletter/excerpt";
import { getSeoMeta, type SeoMeta } from "emdash";

/** The separator Base.astro also uses when it adds the site name to a page's title. */
const TITLE_SEPARATOR = " — ";
const DESCRIPTION_MAX = 160;

type SeoEntry<T> = Parameters<typeof getSeoMeta<T>>[0];

export interface PageSeo {
	readonly siteTitle: string;
	readonly origin: string;
	readonly path: string;
	/** The page's own title, used when the entry's SEO panel sets none. */
	readonly title: string;
	/** The page's text, excerpted for the description when the SEO panel sets none. */
	readonly text: readonly PortableTextBlock[];
	/** The description when the text is empty. */
	readonly fallback: string;
}

/**
 * Title, description and canonical URL for an entry's page. EmDash's own defaults read
 * `data.title` and `data.excerpt`, which a body (`name`) and the site's news and pages (no
 * excerpt) do not have, so every page passes its title and text here. The SEO panel still wins.
 */
export function pageSeo<T>(entry: SeoEntry<T>, page: PageSeo): SeoMeta {
	return getSeoMeta(entry, {
		siteTitle: page.siteTitle,
		siteUrl: page.origin,
		path: page.path,
		titleSeparator: TITLE_SEPARATOR,
		defaultTitle: page.title,
		defaultDescription: excerpt(page.text, DESCRIPTION_MAX) || page.fallback,
	});
}
