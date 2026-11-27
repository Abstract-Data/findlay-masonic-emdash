/** FR-3.3: ten news items per page. */
export const NEWS_PAGE_SIZE = 10;

const PAGE_PARAM = /^[1-9]\d{0,3}$/;

export interface NewsPage<T> {
	readonly items: readonly T[];
	/** 1-based. */
	readonly page: number;
	readonly hasNewer: boolean;
	readonly hasOlder: boolean;
}

/** `?page=2`; anything else is the first page. */
export function parsePage(raw: string | null): number {
	return raw !== null && PAGE_PARAM.test(raw) ? Number(raw) : 1;
}

/** One page of a newest-first list. */
export function pageOf<T>(items: readonly T[], page: number, size = NEWS_PAGE_SIZE): NewsPage<T> {
	const start = (page - 1) * size;
	return {
		items: items.slice(start, start + size),
		page,
		hasNewer: page > 1,
		hasOlder: items.length > start + size,
	};
}
