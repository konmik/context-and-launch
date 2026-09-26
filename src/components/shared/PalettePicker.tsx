import { createSignal, For, useContext } from "solid-js";
import { Palette, Sun, Moon } from "~/components/ui/icons.js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "~/components/ui/menu";
import { PALETTES } from "./palette-pure.js";
import { isDarkMode } from "./theme-toggle-pure.js";
import { AppearanceContext } from './appearance.js';
import type { Result } from '~/util/result.js';
import ErrorDialog from './ErrorDialog.js';
import type { ErrorInfo } from '~/core/shared/errors.js';

export default function PalettePicker() {
  const appearance = useContext(AppearanceContext)!;
  const dark = () => isDarkMode(appearance().mode.get(), window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [error, setError] = createSignal<ErrorInfo | null>(null);
  async function showSaveError(completion: Promise<Result<void, string>>) {
    const result = await completion;
    setError(result.type === 'Failure' ? { title: 'Save appearance failed', description: result.error } : null);
  }

  return (
    <>
      <MenuRoot
        trigger={
          <MenuTrigger
            class="btn-secondary btn-sm label-mono w-auto items-center gap-2.5 whitespace-nowrap"
            style={{ height: "2.25rem", "padding-left": "0.75rem", "padding-right": "0.75rem" }}
            data-testid="palette-picker-trigger"
          >{appearance().palette.get()}<Palette size={16} /></MenuTrigger>
        }
      >
        <MenuContent class="min-w-[160px]">
          <MenuItem
            value="__mode-toggle"
            closeOnSelect={false}
            class="label-mono flex items-center gap-2"
            onClick={() => showSaveError(appearance().mode.update(mode =>
              isDarkMode(mode, window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'light' : 'dark'))}
            data-testid="palette-picker-mode-toggle"
          >
            <span class="flex w-4 justify-center">
              {dark() ? <Sun size={16} /> : <Moon size={16} />}
            </span>
            {dark() ? "Dark → Light" : "Light → Dark"}
          </MenuItem>
          <MenuSeparator />
          <For each={PALETTES}>
            {(name) => (
              <MenuItem
                value={name}
                class={`label-mono flex items-center gap-2 ${
                  name === appearance().palette.get() ? "font-semibold text-foreground" : ""}`}
                onClick={() => showSaveError(appearance().palette.update(() => name))}
                data-testid={`palette-picker-item-${name}`}
              >
                <span class="w-4 text-center">{name === appearance().palette.get() ? "#" : ""}</span>
                {name}
              </MenuItem>
            )}
          </For>
        </MenuContent>
      </MenuRoot>
      <ErrorDialog error={error()} onClose={() => setError(null)} />
    </>
  );
}
