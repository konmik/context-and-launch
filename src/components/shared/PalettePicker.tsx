import { createSignal, createEffect, For } from "solid-js";
import { useLocation } from "@solidjs/router";
import Palette from "lucide-solid/icons/palette";
import Sun from "lucide-solid/icons/sun";
import Moon from "lucide-solid/icons/moon";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "~/components/ui/menu";
import {
  PALETTES, getStoredPalette, setStoredPalette, projectSlugFromPath,
  isPaletteName, type PaletteName,
} from "./palette-pure.js";
import { getStoredMode, setStoredMode, isDarkMode } from "./theme-toggle-pure.js";

function showPalette(name: PaletteName) {
  document.documentElement.dataset.palette = name;
  queueMicrotask(() => window.contextLaunch?.setPalette(name));
}

function showMode(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

function initialPalette(projectSlug: string | undefined): PaletteName {
  const applied = document.documentElement.dataset.palette;
  if (isPaletteName(applied)) return applied;
  return getStoredPalette(localStorage, projectSlug);
}

export default function PalettePicker() {
  const location = useLocation();
  const projectSlug = () => projectSlugFromPath(location.pathname);
  const [active, setActive] = createSignal<PaletteName>(initialPalette(projectSlug()));
  const [theme, setTheme] = createSignal<"light" | "dark">("light");

  createEffect(() => {
    const stored = getStoredPalette(localStorage, projectSlug());
    setActive(stored);
    if (document.documentElement.dataset.palette !== stored) showPalette(stored);

    const mode = getStoredMode(localStorage, projectSlug());
    const matchesDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = isDarkMode(mode, matchesDark);
    setTheme(dark ? "dark" : "light");
    showMode(dark);
    window.contextLaunch?.setMode(mode);
  });

  function select(name: PaletteName) {
    setStoredPalette(localStorage, projectSlug(), name);
    showPalette(name);
    setActive(name);
  }

  function toggleMode() {
    const next = theme() === "dark" ? "light" : "dark";
    setStoredMode(localStorage, projectSlug(), next);
    setTheme(next);
    showMode(next === "dark");
    window.contextLaunch?.setMode(next);
  }

  return (
    <MenuRoot
      trigger={
        <MenuTrigger
          class="btn-secondary btn-sm label-mono w-auto items-center gap-2.5 whitespace-nowrap"
          style={{ height: "2.25rem", "padding-left": "0.75rem", "padding-right": "0.75rem" }}
          data-testid="palette-picker-trigger"
        >{active()}<Palette size={16} /></MenuTrigger>
      }
    >
      <MenuContent class="min-w-[160px]">
        <MenuItem
          value="__mode-toggle"
          closeOnSelect={false}
          class="label-mono flex items-center gap-2"
          onClick={toggleMode}
          data-testid="palette-picker-mode-toggle"
        >
          <span class="flex w-4 justify-center">
            {theme() === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </span>
          {theme() === "dark" ? "Dark → Light" : "Light → Dark"}
        </MenuItem>
        <MenuSeparator />
        <For each={PALETTES}>
          {(name) => (
            <MenuItem
              value={name}
              class={`label-mono flex items-center gap-2 ${name === active() ? "font-semibold text-foreground" : ""}`}
              onClick={() => select(name)}
              data-testid={`palette-picker-item-${name}`}
            >
              <span class="w-4 text-center">{name === active() ? "#" : ""}</span>
              {name}
            </MenuItem>
          )}
        </For>
      </MenuContent>
    </MenuRoot>
  );
}
