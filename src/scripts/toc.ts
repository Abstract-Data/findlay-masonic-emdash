// Build the table of contents from the body's h2/h3 headings
function buildToc() {
	const content = document.querySelector("[data-post-content]");
	const toc = document.querySelector<HTMLElement>("[data-toc]");
	const list = document.querySelector("[data-toc-list]");
	if (!content || !toc || !list) return;

	const headings = [...content.querySelectorAll<HTMLHeadingElement>("h2, h3")];
	toc.hidden = headings.length === 0;
	if (headings.length === 0) return;

	const links = new Map<Element, HTMLAnchorElement>();
	headings.forEach((heading, index) => {
		if (!heading.id) {
			heading.id = `heading-${index}`;
		}

		const item = document.createElement("li");
		item.className = heading.tagName === "H3" ? "toc__item toc__item--nested" : "toc__item";

		const link = document.createElement("a");
		link.href = `#${heading.id}`;
		link.className = "toc__link";
		link.textContent = heading.textContent;

		item.appendChild(link);
		list.appendChild(item);
		links.set(heading, link);
	});

	// Mark the section currently in view
	const setCurrent = (link: HTMLAnchorElement) => {
		for (const other of links.values()) {
			other.removeAttribute("aria-current");
		}
		link.setAttribute("aria-current", "true");
	};
	const first = links.values().next().value;
	if (first) setCurrent(first);

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const link = links.get(entry.target);
				if (link && entry.isIntersecting) setCurrent(link);
			}
		},
		{ rootMargin: "-80px 0px -80% 0px" },
	);

	headings.forEach((heading) => observer.observe(heading));
}

buildToc();
