// Loaded synchronously right after the header, so the height is set before the browser scrolls to a URL fragment.
(function () {
	var header = document.querySelector(".site-header");
	function setHeight() {
		document.documentElement.style.setProperty("--header-height", header.offsetHeight + "px");
	}
	setHeight();
	new ResizeObserver(setHeight).observe(header);
})();
