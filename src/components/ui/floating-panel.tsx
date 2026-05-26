import { FloatingPanel as ArkPanel } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import { Show } from "solid-js";
import type { JSX, ComponentProps } from "solid-js";

type RootProps = ComponentProps<typeof ArkPanel.Root>;

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
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Show when={props.open}>
          <div class="fixed inset-0 bg-black/50" onClick={() => props.onOpenChange?.({ open: false })} />
        </Show>
        <ArkPanel.Positioner>
          <ArkPanel.Content>
            {props.children}
          </ArkPanel.Content>
        </ArkPanel.Positioner>
      </Portal>
    </ArkPanel.Root>
  );
}

export const FloatingPanelHeader = ArkPanel.Header;
export const FloatingPanelTitle = ArkPanel.Title;
export const FloatingPanelBody = ArkPanel.Body;
export const FloatingPanelDragTrigger = ArkPanel.DragTrigger;
export const FloatingPanelResizeTrigger = ArkPanel.ResizeTrigger;
export const FloatingPanelCloseTrigger = ArkPanel.CloseTrigger;
export const FloatingPanelControl = ArkPanel.Control;
