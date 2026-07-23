import { createSignal, onMount, For } from "solid-js";
import { isServer } from "solid-js/web";
import Palette from "lucide-solid/icons/palette";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "~/components/ui/menu";
import { PALETTES, DEFAULT_PALETTE, getStoredPalette, isPaletteName, type PaletteName } from "./palette-pure.js";

declare global {
  interface Window {
    contextLaunch?: { setPalette(name: string): void };
  }
}

function applyPalette(name: PaletteName) {
  document.documentElement.dataset.palette = name;
  localStorage.setItem("palette", name);
  window.contextLaunch?.setPalette(name);
}

// The pre-hydration inline script in entry-server sets data-palette before
// paint. Read it here so the trigger shows the right name from the first
// client render instead of flashing the default and reflowing.
function initialPalette(): PaletteName {
  if (isServer) return DEFAULT_PALETTE;
  const applied = document.documentElement.dataset.palette;
  if (isPaletteName(applied)) return applied;
  return getStoredPalette(localStorage);
}

export default function PalettePicker() {
  const [active, setActive] = createSignal<PaletteName>(initialPalette());

  onMount(() => {
    const stored = getStoredPalette(localStorage);
    setActive(stored);
    applyPalette(stored);
  });

  function select(name: PaletteName) {
    setActive(name);
    applyPalette(name);
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
        <For each={PALETTES}>
          {(name) => (
            <MenuItem
              value={name}
              class={`label-mono whitespace-pre ${name === active() ? "font-semibold text-foreground" : ""}`}
              onClick={() => select(name)}
              data-testid={`palette-picker-item-${name}`}
            >{name === active() ? "# " : "  "}{name}</MenuItem>
          )}
        </For>
      </MenuContent>
    </MenuRoot>
  );
}
