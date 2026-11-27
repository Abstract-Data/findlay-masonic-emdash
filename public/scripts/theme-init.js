// Apply an explicit theme choice immediately to prevent flash.
// With no cookie, color-scheme: light dark follows the OS.
(function () {
	var row = document.cookie.split("; ").find(function (item) {
		return item.startsWith("theme=");
	});
	var theme = row ? row.slice(6) : null;
	if (theme === "dark" || theme === "light") {
		document.documentElement.classList.add(theme);
	}
})();
