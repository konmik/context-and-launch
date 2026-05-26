import { Menu as ArkMenu } from "@ark-ui/solid";
import { Portal } from "solid-js/web";
import type { JSX, ComponentProps } from "solid-js";

type RootProps = ComponentProps<typeof ArkMenu.Root>;

interface MenuProps {
  children: JSX.Element;
  trigger: JSX.Element;
}

function MenuRoot(props: MenuProps) {
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

export const Menu = Object.assign(MenuRoot, {
  Trigger: ArkMenu.Trigger,
  Content: ArkMenu.Content,
  Item: ArkMenu.Item,
  Separator: ArkMenu.Separator,
});
