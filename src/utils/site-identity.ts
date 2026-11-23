/** Resolved media reference from getSiteSettings() */
export interface MediaReference {
	mediaId: string;
	alt?: string;
	url?: string;
}

export interface SiteIdentitySettings {
	title?: string;
	tagline?: string;
	logo?: MediaReference;
	favicon?: MediaReference;
}

const DEFAULT_SITE_TITLE = "Findlay Masonic Temple";

export function resolveSiteIdentity(settings?: SiteIdentitySettings) {
	return {
		siteTitle: settings?.title ?? DEFAULT_SITE_TITLE,
		siteTagline: settings?.tagline ?? "",
		siteLogo: settings?.logo?.url ? settings.logo : null,
	};
}
