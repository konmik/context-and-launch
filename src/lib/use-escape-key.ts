import { onSettled } from "solid-js";

export function useEscapeKey(handler: () => void): void {
  onSettled(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") handler();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });
}
