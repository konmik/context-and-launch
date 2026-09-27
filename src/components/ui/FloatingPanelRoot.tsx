import { Show, createEffect, createUniqueId } from 'solid-js'
import { Portal, type JSX } from '@solidjs/web'
import { createFloatingPanelState } from './floating-panel-state.js'
import { PanelContext } from './floating-panel-context.js'
import { createOverlay, trapOverlayFocus } from './overlay.js'
import { type FloatingWindowProps } from './floating-window.js'
import { FLOATING_WINDOW_MIN_SIZE } from './floating-window.js'

export function FloatingPanelRoot(props: FloatingWindowProps): JSX.Element {
  const initialSize = props.defaultSize ?? {
    width: 768,
    height: 600,
  }
  const initialPosition = props.defaultPosition ?? {
    x: Math.max(0, ((globalThis.window?.innerWidth ?? 1024) - initialSize.width) / 2),
    y: Math.max(0, ((globalThis.window?.innerHeight ?? 800) - initialSize.height) / 2),
  }
  const id = createUniqueId()
  const panel = createFloatingPanelState({
    initialPosition,
    initialSize,
    minSize: () => props.minSize ?? FLOATING_WINDOW_MIN_SIZE,
    maxSize: () => props.maxSize,
    viewport: () => ({
      width: innerWidth,
      height: innerHeight,
    }),
    onPositionChangeEnd: (position) =>
      props.onPositionChangeEnd?.({
        position,
      }),
    onSizeChangeEnd: (size) =>
      props.onSizeChangeEnd?.({
        size,
      }),
  })
  let content!: HTMLDivElement
  const context = {
    close: () =>
      props.onOpenChange?.({
        open: false,
      }),
    startMove: panel.startMove,
    startResize: panel.startResize,
    titleId: `${id}-title`,
  }
  const overlay = createOverlay('dialog', {
    open: () => props.open,
    onDismiss: context.close,
    onFocus: () => content?.focus(),
    onKeyDown: (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!panel.cancelGesture()) context.close()
        return
      }
      trapOverlayFocus(event, content)
    },
  })
  createEffect(
    () => ({
      open: props.open,
      persistRect: props.persistRect,
    }),
    ({ open: isOpen, persistRect }) => {
      if (!isOpen) return
      if (!persistRect) panel.reset()
      panel.constrain()
      const resize = () => panel.constrain()
      window.addEventListener('resize', resize)
      return () => {
        panel.cancelGesture()
        window.removeEventListener('resize', resize)
      }
    },
  )
  return (
    <PanelContext value={context}>
      <Show when={props.open}>
        <Portal mount={overlay.getPortalMount()}>
          <div inert={!overlay.isInteractive()}>
            <div class="fixed inset-0 bg-black/50" onClick={context.close} />
            <div
              data-scope="floating-panel"
              data-part="positioner"
              style={{
                left: `${panel.position().x}px`,
                top: `${panel.position().y}px`,
              }}
            >
              <div
                ref={content}
                role="dialog"
                aria-modal="true"
                aria-labelledby={context.titleId}
                tabindex="-1"
                data-scope="floating-panel"
                data-part="content"
                class={props.fitContent ? 'floating-panel-fit' : undefined}
                style={{
                  left: `${panel.position().x}px`,
                  top: `${panel.position().y}px`,
                  width: `${panel.size().width}px`,
                  height: `${panel.size().height}px`,
                }}
              >
                {props.children}
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </PanelContext>
  )
}
