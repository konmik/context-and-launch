import { createSignal, onMount } from "solid-js";
import Sun from "lucide-solid/icons/sun";
import Moon from "lucide-solid/icons/moon";
import { getStoredMode, isDarkMode } from "./theme-toggle-pure.js";

function applyMode(mode: "light" | "dark") {
  document.documentElement.classList.toggle("dark", mode === "dark");
  localStorage.setItem("theme", mode);
  window.contextLaunch?.setMode(mode);
}

export default function ThemeToggle() {
  const [theme, setTheme] = createSignal<"light" | "dark">("light");

  onMount(() => {
    const mode = getStoredMode(localStorage);
    const matchesDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(isDarkMode(mode, matchesDark) ? "dark" : "light");
    window.contextLaunch?.setMode(mode);
  });

  function toggle() {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    applyMode(next);
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
