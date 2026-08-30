/* eslint-disable max-len */
import { Show, createContext, createEffect, createSignal, useContext } from "solid-js";
import { Portal, type ComponentProps, type JSX } from "@solidjs/web";

interface MenuContextValue {
  open: () => boolean;
  toggle(): void;
  close(restoreFocus?: boolean): void;
  position(): { left: number; top: number };
  trigger?: HTMLButtonElement;
  content?: HTMLDivElement;
}

const MenuContext = createContext<MenuContextValue>();

type MenuButtonProps = Omit<ComponentProps<"button">, "onClick"> & {
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>;
};

export function MenuRoot(props: { children: JSX.Element; trigger: JSX.Element }) {
  const [open, setOpen] = createSignal(false);
  const context: MenuContextValue = {
    open,
    toggle: () => setOpen((value) => !value),
    close: (restoreFocus = false) => {
      setOpen(false);
      if (restoreFocus) queueMicrotask(() => context.trigger?.focus());
    },
    position: () => {
      const rect = context.trigger?.getBoundingClientRect();
      return {
        left: Math.max(8, Math.min(rect?.left ?? 8, window.innerWidth - 208)),
        top: Math.min(rect?.bottom ?? 8, window.innerHeight - 8),
      };
    },
  };
  createEffect(open, (isOpen) => {
    if (!isOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-scope="menu"], [aria-haspopup="menu"]')) return;
      setOpen(false);
    };
    queueMicrotask(() => context.content?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus());
    const keydown = (event: KeyboardEvent) => event.key === "Escape" && context.close(true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", keydown); };
  });
  return <MenuContext value={context}>{props.trigger}<Show when={open()}><Portal>{props.children}</Portal></Show></MenuContext>;
}

export function MenuTrigger(props: MenuButtonProps) {
  const menu = useContext(MenuContext);
  return <button ref={(element) => { menu.trigger = element; }} type="button" {...props} aria-haspopup="menu" aria-expanded={menu.open() ? "true" : "false"} onPointerDown={(e) => e.stopPropagation()} onClick={(event) => {
    props.onClick?.(event);
    menu.toggle();
  }} />;
}
export function MenuContent(props: ComponentProps<"div">) {
  const menu = useContext(MenuContext);
  return <div
    {...props}
    ref={(element) => { menu.content = element; }}
    role="menu"
    data-scope="menu"
    data-part="content"
    style={{ position: "fixed", left: `${menu.position().left}px`, top: `${menu.position().top}px` }}
    onPointerDown={(e) => e.stopPropagation()}
    onKeyDown={(event) => {
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')];
      if (!items.length) return;
      const activeElement = document.activeElement;
      const current = activeElement instanceof HTMLElement
        ? items.indexOf(activeElement)
        : -1;
      let next: number | undefined;
      if (event.key === "ArrowDown") next = (current + 1) % items.length;
      if (event.key === "ArrowUp") next = (current <= 0 ? items.length : current) - 1;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = items.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      items[next].focus();
    }}
  />;
}
export function MenuItem(props: MenuButtonProps & { value?: string; closeOnSelect?: boolean }) {
  const menu = useContext(MenuContext);
  return <button
    type="button"
    {...props}
    role="menuitem"
    data-scope="menu"
    data-part="item"
    data-disabled={props.disabled ? "" : undefined}
    onClick={(event) => {
      props.onClick?.(event);
      if (props.closeOnSelect !== false) menu.close(true);
    }}
  />;
}
export function MenuSeparator(props: ComponentProps<"div">) {
  return <div {...props} role="separator" data-scope="menu" data-part="separator" />;
}
