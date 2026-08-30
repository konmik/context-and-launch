/* eslint-disable max-len */
import { Show, createContext, createEffect, createMemo, createUniqueId, useContext } from "solid-js";
import { Portal, type ComponentProps, type JSX } from "@solidjs/web";

const DialogContext = createContext<{ close(): void; titleId: string; descriptionId: string }>();

export function DialogRoot(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: JSX.Element;
  class?: string;
  closeOnInteractOutside?: boolean;
  onMouseDown?: (e: MouseEvent) => void;
  ref?: (el: HTMLDivElement) => void;
}) {
  let content!: HTMLDivElement;
  let previouslyFocused: HTMLElement | null = null;
  const open = createMemo(() => props.open);
  const id = createUniqueId();
  const context = {
    close: () => props.onOpenChange(false),
    titleId: `${id}-title`,
    descriptionId: `${id}-description`,
  };
  createEffect(open, (isOpen) => {
    if (!isOpen) return;
    previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    queueMicrotask(() => content?.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])")?.focus());
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const dialogs = document.querySelectorAll('[data-scope="dialog"][data-part="content"][data-state="open"]');
        const menu = document.querySelector('[data-scope="menu"][data-part="content"]');
        if (!menu && dialogs.item(dialogs.length - 1) === content) props.onOpenChange(false);
      }
      if (event.key !== "Tab") return;
      const focusable = [...content.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])")];
      if (!focusable.length) return;
      const activeElement = document.activeElement;
      const current = activeElement instanceof HTMLElement
        ? focusable.indexOf(activeElement)
        : -1;
      const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current + 1) % focusable.length;
      event.preventDefault();
      focusable[next].focus();
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      previouslyFocused?.focus();
    };
  });
  return (
    <Show when={open()}>
      <DialogContext value={context}>
        <Portal>
          <div data-scope="dialog" data-part="backdrop" />
          <div
            data-scope="dialog"
            data-part="positioner"
            onPointerDown={(event) => {
              if (event.button === 0 && event.target === event.currentTarget && props.closeOnInteractOutside !== false) {
                props.onOpenChange(false);
              }
            }}
          >
            <div
              ref={(element) => { content = element; props.ref?.(element); }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={context.titleId}
              aria-describedby={context.descriptionId}
              data-state="open"
              data-scope="dialog"
              data-part="content"
              class={props.class}
              onMouseDown={props.onMouseDown}
            >{props.children}</div>
          </div>
        </Portal>
      </DialogContext>
    </Show>
  );
}

export function DialogTitle(props: ComponentProps<"h2">) {
  const dialog = useContext(DialogContext);
  return <h2 {...props} id={dialog.titleId} data-scope="dialog" data-part="title" />;
}
export function DialogDescription(props: ComponentProps<"p">) {
  const dialog = useContext(DialogContext);
  return <p {...props} id={dialog.descriptionId} data-scope="dialog" data-part="description" />;
}
export function DialogCloseTrigger(props: ComponentProps<"button">) {
  const dialog = useContext(DialogContext);
  return <button type="button" {...props} data-scope="dialog" data-part="close-trigger" onClick={dialog.close} />;
}
