import { createEffect } from "solid-js";

declare global {
  interface Navigator {
    readonly userAgentData?: { readonly platform?: string };
  }
}

interface UseModEnterSubmitOptions {
  onSubmit: () => void;
  disabled: () => boolean;
  active: () => boolean;
}

export function useModEnterSubmit(options: UseModEnterSubmitOptions) {
  createEffect(options.active, (active) => {
    if (!active) return;

    function handler(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if (e.key !== "Enter") return;
      if (!e.metaKey && !e.ctrlKey) return;

      // Always consume the event when the topmost dialog is active,
      // even if disabled, to prevent lower dialogs from firing.
      e.preventDefault();

      if (!options.disabled()) {
        options.onSubmit();
      }
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  });
}

export function modEnterHint(): string {
  const browserNavigator = globalThis.navigator;
  const isMac =
    /Mac|iPhone|iPad|iPod/i.test(browserNavigator?.platform ?? "") ||
    browserNavigator?.userAgentData?.platform === "macOS";
  return isMac ? "Cmd+Enter" : "Ctrl+Enter";
}
