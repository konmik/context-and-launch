import { Tabs as ArkTabs } from "@ark-ui/solid";
import type { JSX, ComponentProps } from "solid-js";

type RootProps = ComponentProps<typeof ArkTabs.Root>;

export function TabsRoot(props: {
  value: RootProps["value"];
  onValueChange: RootProps["onValueChange"];
  children: JSX.Element;
  class?: string;
  onMouseDown?: (e: MouseEvent) => void;
}) {
  return (
    <ArkTabs.Root
      value={props.value}
      onValueChange={props.onValueChange}
      class={props.class}
      onMouseDown={props.onMouseDown}
    >
      {props.children}
    </ArkTabs.Root>
  );
}

export function TabsList(props: { children: JSX.Element }) {
  return (
    <ArkTabs.List>
      {props.children}
      <ArkTabs.Indicator />
    </ArkTabs.List>
  );
}

export const TabsTrigger = ArkTabs.Trigger;
export const TabsContent = ArkTabs.Content;
