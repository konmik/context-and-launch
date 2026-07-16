import { createSignal, onMount, type JSX } from "solid-js";

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExpandingOverlayOrigin extends OverlayRect {
  containerWidth: number;
  containerHeight: number;
}

type OverlayElementAttributes = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "children" | "class" | "style"
> & { [attribute: `data-${string}`]: string | undefined };

interface ExpandingOverlayProps {
  children: JSX.Element;
  origin?: ExpandingOverlayOrigin;
  onClose: () => void;
  insetPercent?: number;
  backdropAttributes?: OverlayElementAttributes;
  panelAttributes?: OverlayElementAttributes;
  panelClass?: string;
}

export default function ExpandingOverlay(props: ExpandingOverlayProps) {
  const insetPercent = () => props.insetPercent ?? 5;
  const initialTransform = () => {
    if (!props.origin) return undefined;
    const inset = insetPercent() / 100;
    const targetX = props.origin.containerWidth * inset;
    const targetY = props.origin.containerHeight * inset;
    const targetWidth = props.origin.containerWidth * (1 - inset * 2);
    const targetHeight = props.origin.containerHeight * (1 - inset * 2);
    return [
      `translate(${props.origin.x - targetX}px, ${props.origin.y - targetY}px)`,
      `scale(${props.origin.width / targetWidth}, ${props.origin.height / targetHeight})`,
    ].join(" ");
  };
  const [transform, setTransform] = createSignal(initialTransform());

  onMount(() => {
    if (!transform()) return;
    requestAnimationFrame(() => requestAnimationFrame(() => setTransform(undefined)));
  });

  return (
    <div
      {...props.backdropAttributes}
      class="absolute inset-0"
      on:pointerdown={(event: PointerEvent) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div
        {...props.panelAttributes}
        class={props.panelClass}
        style={{
          left: `${insetPercent()}%`,
          top: `${insetPercent()}%`,
          width: `${100 - insetPercent() * 2}%`,
          height: `${100 - insetPercent() * 2}%`,
          transform: transform(),
          "transform-origin": "0 0",
          transition: transform() ? undefined : "transform 200ms ease-out",
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
