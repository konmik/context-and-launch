import { Show, createMemo, createUniqueId } from 'solid-js'
import { Portal, type JSX } from '@solidjs/web'
import { createOverlay, trapOverlayFocus } from './overlay.js'
import { DialogContext } from './dialog-context.js'

export function DialogRoot(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: JSX.Element
  class?: string
  closeOnInteractOutside?: boolean
  onMouseDown?: (e: MouseEvent) => void
  ref?: (el: HTMLDivElement) => void
}): JSX.Element {
  let content!: HTMLDivElement
  const open = createMemo(() => props.open)
  const id = createUniqueId()
  const context = {
    close: () => props.onOpenChange(false),
    titleId: `${id}-title`,
    descriptionId: `${id}-description`,
  }
  const overlay = createOverlay('modal', {
    open,
    dismiss: context.close,
    focus: () => (content?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ) ?? content)?.focus(),
    keydown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        context.close()
        return
      }
      trapOverlayFocus(event, content)
    },
  })
  return (
    <Show when={open()}>
      <DialogContext value={context}>
        <Portal>
          <div hidden={!overlay.visible()} inert={!overlay.visible()}>
            <div data-scope="dialog" data-part="backdrop" />
            <div
              data-scope="dialog"
              data-part="positioner"
              onPointerDown={(event) => {
                if (event.button === 0 && event.target === event.currentTarget && props.closeOnInteractOutside !== false) {
                  props.onOpenChange(false)
                }
              }}
            >
              <div
                ref={(element) => {
                  content = element
                  props.ref?.(element)
                }}
                role="dialog"
                tabindex="-1"
                aria-modal="true"
                aria-labelledby={context.titleId}
                aria-describedby={context.descriptionId}
                data-state="open"
                data-scope="dialog"
                data-part="content"
                class={props.class}
                onMouseDown={props.onMouseDown}
              >
                {props.children}
              </div>
            </div>
          </div>
        </Portal>
      </DialogContext>
    </Show>
  )
}
