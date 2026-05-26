import { Dialog as ArkDialog } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import type { JSX, ComponentProps } from "solid-js";

type RootProps = ComponentProps<typeof ArkDialog.Root>;

interface DialogProps {
  open: RootProps["open"];
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
  class?: string;
  onMouseDown?: (e: MouseEvent) => void;
  ref?: HTMLDivElement | ((el: HTMLDivElement) => void);
}

function DialogRoot(props: DialogProps) {
  return (
    <ArkDialog.Root open={props.open} onOpenChange={(d) => { if (!d.open) props.onOpenChange(false); }}>
      <Portal>
        <ArkDialog.Backdrop />
        <ArkDialog.Positioner>
          <ArkDialog.Content class={props.class} onMouseDown={props.onMouseDown} ref={props.ref}>
            {props.children}
          </ArkDialog.Content>
        </ArkDialog.Positioner>
      </Portal>
    </ArkDialog.Root>
  );
}

export const Dialog = Object.assign(DialogRoot, {
  Title: ArkDialog.Title,
  Description: ArkDialog.Description,
  CloseTrigger: ArkDialog.CloseTrigger,
});
