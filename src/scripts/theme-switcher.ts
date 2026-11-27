// Theme switcher
const themeBtns = document.querySelectorAll<HTMLButtonElement>(".theme-btn");
const root = document.documentElement;

function setCookie(name: string, value: string, maxAge: number = 31536000) {
	const secure = location.protocol === "https:" ? "; Secure" : "";
	if (value === "") {
		document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${secure}`;
	} else {
		document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
	}
}

function setTheme(theme: string) {
	if (theme === "system") {
		setCookie("theme", "");
		root.classList.remove("light", "dark");
	} else {
		setCookie("theme", theme);
		root.classList.remove("light", "dark");
		root.classList.add(theme);
	}
	updateActiveBtn(theme);
}

function updateActiveBtn(theme: string) {
	themeBtns.forEach((btn) => {
		const active = btn.dataset.theme === theme;
		btn.classList.toggle("active", active);
		btn.setAttribute("aria-pressed", String(active));
	});
}

function getStoredTheme(): string {
	const row = document.cookie.split("; ").find((item) => item.startsWith("theme="));
	return row?.slice(6) || "system";
}

// Initialize
const storedTheme = getStoredTheme();
setTheme(storedTheme);

themeBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		setTheme(btn.dataset.theme || "system");
	});
});
