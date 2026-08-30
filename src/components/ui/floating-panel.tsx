/* eslint-disable max-len */
import { Show, createContext, createEffect, createUniqueId, omit, useContext } from "solid-js";
import { Portal, type ComponentProps, type JSX } from "@solidjs/web";
import {
  createFloatingPanelState,
  type FloatingPanelPosition as Position,
  type FloatingPanelSize as Size,
} from "./floating-panel-state.js";

type FloatingWindowProps = {
  open: boolean;
  onOpenChange?: (details: { open: boolean }) => void;
  defaultSize?: Size;
  minSize?: Size;
  maxSize?: Size;
  defaultPosition?: Position;
  onPositionChangeEnd?: (details: { position: Position }) => void;
  onSizeChangeEnd?: (details: { size: Size }) => void;
  persistRect?: boolean;
  fitContent?: boolean;
  children: JSX.Element;
};

const PanelContext = createContext<{
  close(): void;
  startMove(event: PointerEvent): void;
  startResize(event: PointerEvent): void;
  titleId: string;
}>();

export const FLOATING_WINDOW_MIN_SIZE = { width: 400, height: 300 };
export function tallWindowDefaultSize() {
  return { width: 768, height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8) };
}

export function FloatingPanelRoot(props: FloatingWindowProps) {
  const initialSize = props.defaultSize ?? { width: 768, height: 600 };
  const initialPosition = props.defaultPosition ?? {
    x: Math.max(0, ((globalThis.window?.innerWidth ?? 1024) - initialSize.width) / 2),
    y: Math.max(0, ((globalThis.window?.innerHeight ?? 800) - initialSize.height) / 2),
  };
  const id = createUniqueId();
  const panel = createFloatingPanelState({
    initialPosition,
    initialSize,
    minSize: () => props.minSize ?? FLOATING_WINDOW_MIN_SIZE,
    maxSize: () => props.maxSize,
    viewport: () => ({ width: innerWidth, height: innerHeight }),
    onPositionChangeEnd: (position) => props.onPositionChangeEnd?.({ position }),
    onSizeChangeEnd: (size) => props.onSizeChangeEnd?.({ size }),
  });
  let content!: HTMLDivElement;
  let previousFocus: HTMLElement | null = null;
  const context = {
    close: () => props.onOpenChange?.({ open: false }),
    startMove: panel.startMove,
    startResize: panel.startResize,
    titleId: `${id}-title`,
  };

  createEffect(() => ({ open: props.open, persistRect: props.persistRect }), ({ open: isOpen, persistRect }) => {
    if (!isOpen) return;
    if (!persistRect) panel.reset();
    panel.constrain();
    previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    queueMicrotask(() => content?.focus());
    const childOverlayOpen = () => document.querySelector(
      '[data-scope="dialog"][data-part="content"][data-state="open"], [data-scope="menu"][data-part="content"]',
    );
    const keydown = (event: KeyboardEvent) => {
      if (childOverlayOpen()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!panel.cancelGesture()) context.close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...content.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.closest("[hidden]"));
      if (!focusable.length) return;
      const activeElement = document.activeElement;
      const current = activeElement instanceof HTMLElement
        ? focusable.indexOf(activeElement)
        : -1;
      const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current + 1) % focusable.length;
      event.preventDefault();
      focusable[next].focus();
    };
    const resize = () => panel.constrain();
    document.addEventListener("keydown", keydown);
    window.addEventListener("resize", resize);
    return () => {
      panel.cancelGesture();
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", resize);
      previousFocus?.focus();
    };
  });

  return (
    <PanelContext value={context}>
      <Show when={props.open}>
        <Portal>
          <div class="fixed inset-0 bg-black/50" onClick={context.close} />
          <div
            data-scope="floating-panel"
            data-part="positioner"
            style={{ left: `${panel.position().x}px`, top: `${panel.position().y}px` }}
          >
            <div
              ref={content}
              role="dialog"
              aria-modal="true"
              aria-labelledby={context.titleId}
              tabindex="-1"
              data-scope="floating-panel"
              data-part="content"
              class={props.fitContent ? "floating-panel-fit" : undefined}
              style={{ left: `${panel.position().x}px`, top: `${panel.position().y}px`, width: `${panel.size().width}px`, height: `${panel.size().height}px` }}
            >{props.children}</div>
          </div>
        </Portal>
      </Show>
    </PanelContext>
  );
}

export function FloatingPanelTitle(props: ComponentProps<"h2">) { const panel = useContext(PanelContext); return <h2 {...props} id={panel.titleId} data-scope="floating-panel" data-part="title" />; }
export function FloatingPanelBody(props: ComponentProps<"div">) { return <div {...props} data-scope="floating-panel" data-part="body" />; }
export function FloatingPanelDragStrip(props?: { "data-testid"?: string }) {
  const panel = useContext(PanelContext);
  return <div class="drag-strip" role="presentation" aria-label="Drag to move window" data-scope="floating-panel" data-part="drag-trigger" data-testid={props?.["data-testid"]} onPointerDown={panel.startMove} />;
}
export function FloatingPanelCloseTrigger(props: ComponentProps<"button">) {
  const panel = useContext(PanelContext);
  return <button type="button" {...props} aria-label={props["aria-label"] ?? "Close window"} data-scope="floating-panel" data-part="close-trigger" onClick={panel.close} />;
}
function FloatingPanelResizeTrigger() {
  const panel = useContext(PanelContext);
  return <div style={{ position: "absolute", right: 0, bottom: 0 }} data-scope="floating-panel" data-part="resize-trigger" data-axis="se" onPointerDown={panel.startResize} />;
}
export function FloatingWindow(props: FloatingWindowProps) {
  const rootProps = omit(props, "children");
  return <FloatingPanelRoot {...rootProps}><div data-scope="floating-panel" data-part="viewport"><FloatingPanelDragStrip />{props.children}</div><FloatingPanelResizeTrigger /></FloatingPanelRoot>;
}
export function FloatingWindowHeader(props: { title?: JSX.Element; actions?: JSX.Element; children?: JSX.Element }) {
  return <div data-scope="floating-panel" data-part="header"><div class="flex flex-col gap-3 p-4"><div class="flex items-center justify-between gap-4"><div class="window-title flex min-w-0 flex-1 items-center gap-1.5">{props.title}</div><Show when={props.actions}><div class="flex shrink-0 items-center gap-1">{props.actions}</div></Show></div>{props.children}</div></div>;
}
