import { createEffect, onCleanup } from "solid-js";

interface UseModEnterSubmitOptions {
  onSubmit: () => void;
  disabled: () => boolean;
  active: () => boolean;
}

export function useModEnterSubmit(options: UseModEnterSubmitOptions) {
  createEffect(() => {
    if (!options.active()) return;

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
    onCleanup(() => document.removeEventListener("keydown", handler));
  });
}

export function modEnterHint(): string {
  const isMac =
    typeof navigator !== "undefined" &&
    (/Mac|iPhone|iPad|iPod/i.test(navigator.platform) ||
      (navigator as any).userAgentData?.platform === "macOS");
  return isMac ? "Cmd+Enter" : "Ctrl+Enter";
}
