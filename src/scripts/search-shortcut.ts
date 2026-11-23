// ⌘K / Ctrl+K focuses the header search
const searchInput = document.querySelector<HTMLInputElement>(".site-search-input");
const kbd = document.querySelector(".site-search__kbd span");
if (kbd && !/Mac|iPhone|iPad|iPod/.test(navigator.platform)) {
	kbd.textContent = "Ctrl K";
}
document.addEventListener("keydown", (e) => {
	if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
	// The header search is hidden on small screens; leave the shortcut to the browser there
	if (!searchInput || searchInput.getClientRects().length === 0) return;
	e.preventDefault();
	searchInput.focus();
});
