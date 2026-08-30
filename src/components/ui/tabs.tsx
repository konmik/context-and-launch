/* eslint-disable max-len */
import { createContext, createUniqueId, useContext } from "solid-js";
import type { ComponentProps, JSX } from "@solidjs/web";

const TabsContext = createContext<{ id: string; value: () => string; select(value: string): void }>();

export function TabsRoot(props: {
  value: string;
  onValueChange: (details: { value: string }) => void;
  children: JSX.Element;
  class?: string;
  onMouseDown?: (e: MouseEvent) => void;
}) {
  const id = createUniqueId();
  return <TabsContext value={{ id, value: () => props.value, select: (value) => props.onValueChange({ value }) }}><div class={props.class} onMouseDown={props.onMouseDown} data-scope="tabs" data-part="root">{props.children}</div></TabsContext>;
}
export function TabsList(props: { children: JSX.Element }) {
  return <div role="tablist" data-scope="tabs" data-part="list">{props.children}</div>;
}
export function TabsTrigger(props: ComponentProps<"button"> & { value: string }) {
  const tabs = useContext(TabsContext);
  const selected = () => tabs.value() === props.value;
  const tabId = () => `${tabs.id}-tab-${props.value}`;
  const panelId = () => `${tabs.id}-panel-${props.value}`;
  return <button type="button" {...props} id={tabId()} aria-controls={panelId()} role="tab" tabindex={selected() ? 0 : -1} data-scope="tabs" data-part="trigger" data-selected={selected() ? "" : null} aria-selected={selected() ? "true" : "false"} onClick={() => tabs.select(props.value)} onKeyDown={(event) => {
    const tabs = [...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')];
    const current = tabs.indexOf(event.currentTarget);
    let next: number | undefined;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (current <= 0 ? tabs.length : current) - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  }} />;
}
export function TabsContent(props: ComponentProps<"div"> & { value: string }) {
  const tabs = useContext(TabsContext);
  return <div {...props} hidden={tabs.value() !== props.value} id={`${tabs.id}-panel-${props.value}`} aria-labelledby={`${tabs.id}-tab-${props.value}`} role="tabpanel" data-scope="tabs" data-part="content" />;
}
