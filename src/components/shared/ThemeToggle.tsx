import { createSignal, onMount } from "solid-js";
import Sun from "lucide-solid/icons/sun";
import Moon from "lucide-solid/icons/moon";
import { getStoredTheme } from "./theme-toggle-pure.js";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem("theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = createSignal<"light" | "dark">("light");

  onMount(() => {
    const matchesDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(getStoredTheme(localStorage, matchesDark));
  });

  function toggle() {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      class="btn-icon"
      onClick={toggle}
      title={theme() === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="theme-toggle-button"
    >
      {theme() === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
