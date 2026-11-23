export interface SnippetSegment {
	text: string;
	marked: boolean;
}

const ENTITIES: Record<string, string> = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
};

function unescapeHtml(text: string): string {
	return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);
}

/**
 * EmDash returns search snippets as escaped HTML whose only markup is
 * literal <mark> pairs. Splitting them into text segments lets the page
 * render highlights as elements, so no raw HTML reaches the template.
 */
export function parseSnippet(snippet: string): SnippetSegment[] {
	return snippet
		.split(/(<mark>.*?<\/mark>)/s)
		.filter((part) => part !== "")
		.map((part) => {
			const marked = part.startsWith("<mark>") && part.endsWith("</mark>");
			const inner = marked ? part.slice("<mark>".length, -"</mark>".length) : part;
			return { text: unescapeHtml(inner), marked };
		});
}

export function segmentsText(segments: readonly SnippetSegment[]): string {
	return segments.map((segment) => segment.text).join("");
}
