import { createSignal, onMount, For } from "solid-js";
import Palette from "lucide-solid/icons/palette";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "~/components/ui/menu";
import { PALETTES, getStoredPalette, isPaletteName, type PaletteName } from "./palette-pure.js";

declare global {
  interface Window {
    contextLaunch?: { setPalette(name: string): void };
  }
}

function applyPalette(name: PaletteName) {
  document.documentElement.dataset.palette = name;
  queueMicrotask(() => {
    localStorage.setItem("palette", name);
    window.contextLaunch?.setPalette(name);
  });
}

function initialPalette(): PaletteName {
  const applied = document.documentElement.dataset.palette;
  if (isPaletteName(applied)) return applied;
  return getStoredPalette(localStorage);
}

export default function PalettePicker() {
  const [active, setActive] = createSignal<PaletteName>(initialPalette());

  onMount(() => {
    const stored = getStoredPalette(localStorage);
    setActive(stored);
    if (document.documentElement.dataset.palette !== stored) applyPalette(stored);
  });

  function select(name: PaletteName) {
    applyPalette(name);
    setActive(name);
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
