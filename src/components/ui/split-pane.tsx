import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";

export function SplitPane(props: {
  initialPercent: number;
  minPercent?: number;
  onChangeEnd?: (sizes: [number, number]) => void;
  first: JSX.Element;
  second: JSX.Element;
  separatorClass?: string;
}) {
  const min = props.minPercent ?? 20;
  const clamp = (value: number) => Math.max(min, Math.min(100 - min, value));
  const [percent, setPercent] = createSignal(clamp(props.initialPercent));
  let root!: HTMLDivElement;
  function resizeToPointer(event: PointerEvent) {
    const rect = root.getBoundingClientRect();
    setPercent(clamp(((event.clientX - rect.left) / rect.width) * 100));
  }
  function startResize(event: PointerEvent) {
    const separator = event.currentTarget;
    if (!(separator instanceof HTMLElement)) return;
    separator.setPointerCapture(event.pointerId);
    const removeListeners = () => {
      separator.removeEventListener("pointermove", resizeToPointer);
      separator.removeEventListener("pointerup", end);
      separator.removeEventListener("pointercancel", cancel);
    };
    const end = () => {
      removeListeners();
      props.onChangeEnd?.([percent(), 100 - percent()]);
    };
    const cancel = () => removeListeners();
    separator.addEventListener("pointermove", resizeToPointer);
    separator.addEventListener("pointerup", end);
    separator.addEventListener("pointercancel", cancel);
  }
  function resizeWithKeyboard(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = clamp(percent() + (event.key === "ArrowLeft" ? -2 : 2));
    setPercent(next);
    props.onChangeEnd?.([next, 100 - next]);
  }
  return (
    <div ref={root} class="flex h-full">
      <div style={{ width: `${percent()}%` }}>{props.first}</div>
      <div
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-valuemin={min}
        aria-valuemax={100 - min}
        aria-valuenow={percent()}
        class={props.separatorClass}
        onPointerDown={startResize}
        onKeyDown={resizeWithKeyboard}
      />
      <div style={{ width: `${100 - percent()}%` }}>{props.second}</div>
    </div>
  );
}
