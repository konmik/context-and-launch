import { FloatingPanel as ArkPanel } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import { Show } from "solid-js";
import type { JSX, ComponentProps } from "solid-js";

type RootProps = ComponentProps<typeof ArkPanel.Root>;

export const FLOATING_WINDOW_MIN_SIZE = { width: 400, height: 300 };

export function tallWindowDefaultSize() {
  return { width: 768, height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8) };
}

export function FloatingPanelRoot(props: {
  open: RootProps["open"];
  onOpenChange?: RootProps["onOpenChange"];
  defaultSize?: RootProps["defaultSize"];
  minSize?: RootProps["minSize"];
  maxSize?: RootProps["maxSize"];
  defaultPosition?: RootProps["defaultPosition"];
  onPositionChangeEnd?: RootProps["onPositionChangeEnd"];
  onSizeChangeEnd?: RootProps["onSizeChangeEnd"];
  persistRect?: RootProps["persistRect"];
  fitContent?: boolean;
  children: JSX.Element;
}) {
  return (
    <ArkPanel.Root
      open={props.open}
      onOpenChange={props.onOpenChange}
      defaultSize={props.defaultSize}
      minSize={props.minSize}
      maxSize={props.maxSize}
      defaultPosition={props.defaultPosition}
      onPositionChangeEnd={props.onPositionChangeEnd}
      onSizeChangeEnd={props.onSizeChangeEnd}
      persistRect={props.persistRect}
      closeOnEscape
    >
      <Portal>
        <Show when={props.open}>
          <div class="fixed inset-0 bg-black/50" onClick={() => props.onOpenChange?.({ open: false })} />
          <ArkPanel.Positioner>
            <ArkPanel.Content class={props.fitContent ? "floating-panel-fit" : undefined}>
              {props.children}
            </ArkPanel.Content>
          </ArkPanel.Positioner>
        </Show>
      </Portal>
    </ArkPanel.Root>
  );
}

export const FloatingPanelHeader = ArkPanel.Header;
export const FloatingPanelTitle = ArkPanel.Title;
export const FloatingPanelBody = ArkPanel.Body;
export const FloatingPanelDragTrigger = ArkPanel.DragTrigger;

export function FloatingPanelDragStrip(props?: { "data-testid"?: string }) {
  return (
    <ArkPanel.DragTrigger
      class="drag-strip"
      aria-label="Drag to move window"
      data-testid={props?.["data-testid"]}
    />
  );
}
export const FloatingPanelCloseTrigger = ArkPanel.CloseTrigger;
export const FloatingPanelControl = ArkPanel.Control;

export function FloatingPanelResizeHandles() {
  return (
    <>
      <ArkPanel.ResizeTrigger axis="s" />
      <ArkPanel.ResizeTrigger axis="w" />
      <ArkPanel.ResizeTrigger axis="e" />
      <ArkPanel.ResizeTrigger axis="n" />
      <ArkPanel.ResizeTrigger axis="ne" />
      <ArkPanel.ResizeTrigger axis="nw" />
      <ArkPanel.ResizeTrigger axis="sw" />
      <ArkPanel.ResizeTrigger axis="se" />
    </>
  );
}

/**
 * A draggable, resizable floating window. Provides the frame: the top drag
 * strip and the resize handles. Compose a FloatingWindowHeader and a
 * FloatingPanelBody (optionally wrapped, e.g. in a TabsRoot) as children.
 */
export function FloatingWindow(props: {
  open: RootProps["open"];
  onOpenChange?: RootProps["onOpenChange"];
  defaultSize?: RootProps["defaultSize"];
  minSize?: RootProps["minSize"];
  maxSize?: RootProps["maxSize"];
  defaultPosition?: RootProps["defaultPosition"];
  onPositionChangeEnd?: RootProps["onPositionChangeEnd"];
  onSizeChangeEnd?: RootProps["onSizeChangeEnd"];
  persistRect?: RootProps["persistRect"];
  fitContent?: boolean;
  children: JSX.Element;
}) {
  return (
    <FloatingPanelRoot
      open={props.open}
      onOpenChange={props.onOpenChange}
      defaultSize={props.defaultSize}
      minSize={props.minSize}
      maxSize={props.maxSize}
      defaultPosition={props.defaultPosition}
      onPositionChangeEnd={props.onPositionChangeEnd}
      onSizeChangeEnd={props.onSizeChangeEnd}
      persistRect={props.persistRect}
      fitContent={props.fitContent}
    >
      <FloatingPanelDragStrip />
      {props.children}
      <FloatingPanelResizeHandles />
    </FloatingPanelRoot>
  );
}

/**
 * Window header row: a title area (window title font is applied) and an
 * actions area for buttons. `children` renders below the title row, e.g. a
 * TabsList that bleeds to the header edges.
 */
export function FloatingWindowHeader(props: {
  title?: JSX.Element;
  actions?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <ArkPanel.Header>
      <div class="flex flex-col gap-3 p-4">
        <div class="flex items-center justify-between gap-4">
          <div class="window-title flex min-w-0 flex-1 items-center gap-1.5">
            {props.title}
          </div>
          <Show when={props.actions}>
            <div class="flex shrink-0 items-center gap-1">{props.actions}</div>
          </Show>
        </div>
        {props.children}
      </div>
    </ArkPanel.Header>
  );
}
