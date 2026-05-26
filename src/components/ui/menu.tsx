import { Menu as ArkMenu } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import type { JSX } from "solid-js";

export function MenuRoot(props: {
  children: JSX.Element;
  trigger: JSX.Element;
}) {
  return (
    <ArkMenu.Root>
      {props.trigger}
      <Portal>
        <ArkMenu.Positioner>
          {props.children}
        </ArkMenu.Positioner>
      </Portal>
    </ArkMenu.Root>
  );
}

export const MenuTrigger = ArkMenu.Trigger;
export const MenuContent = ArkMenu.Content;
export const MenuItem = ArkMenu.Item;
export const MenuSeparator = ArkMenu.Separator;
