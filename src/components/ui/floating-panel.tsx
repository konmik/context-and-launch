import { FloatingPanel as ArkPanel } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import { Show, splitProps } from "solid-js";
import type { JSX, ComponentProps } from "solid-js";

type RootProps = ComponentProps<typeof ArkPanel.Root>;
type FloatingWindowProps = {
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
};

export const FLOATING_WINDOW_MIN_SIZE = { width: 400, height: 300 };

export function tallWindowDefaultSize() {
  return { width: 768, height: Math.floor((globalThis.window?.innerHeight ?? 800) * 0.8) };
}

export function FloatingPanelRoot(props: FloatingWindowProps) {
  const [contentProps, rootProps] = splitProps(props, ["children", "fitContent"]);
  return (
    <ArkPanel.Root {...rootProps} closeOnEscape>
      <Portal>
        <Show when={rootProps.open}>
          <div
            class="fixed inset-0 bg-black/50"
            onClick={() => rootProps.onOpenChange?.({ open: false })}
          />
          <ArkPanel.Positioner>
            <ArkPanel.Content
              class={contentProps.fitContent ? "floating-panel-fit" : undefined}
            >
              {contentProps.children}
            </ArkPanel.Content>
          </ArkPanel.Positioner>
        </Show>
      </Portal>
    </ArkPanel.Root>
  );
}

export const FloatingPanelTitle = ArkPanel.Title;
export const FloatingPanelBody = ArkPanel.Body;

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

export function FloatingWindow(props: FloatingWindowProps) {
  const [contentProps, rootProps] = splitProps(props, ["children"]);
  return (
    <FloatingPanelRoot {...rootProps}>
      <FloatingPanelDragStrip />
      {contentProps.children}
      <ArkPanel.ResizeTrigger axis="se" />
    </FloatingPanelRoot>
  );
}

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
