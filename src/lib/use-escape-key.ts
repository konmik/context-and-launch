import { onCleanup, onMount } from "solid-js";

export function useEscapeKey(handler: () => void): void {
  onMount(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handler();
    }
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });
}
