import { createEffect, createSignal } from 'solid-js'

type OverlayKind = 'dialog' | 'popup'

interface OverlayEntry {
  id: symbol
  returnFocusTarget?: HTMLElement
  ownerDialogId?: symbol
}

interface OverlayState {
  dialogIds: symbol[]
  popup?: OverlayEntry
}

interface OverlayCallbacks {
  onDismiss(): void
  onKeyDown(event: KeyboardEvent): void
  onFocus(): void
}

interface OverlayCoordinator {
  createOverlay(kind: OverlayKind, options: OverlayOptions): OverlayHandle
}

const coordinators = new WeakMap<Document, OverlayCoordinator>()

function isAvailableForFocus(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert]')) return false
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  return true
}

function createOverlayCoordinator(document: Document): OverlayCoordinator {
  let state: OverlayState = {
    dialogIds: [],
  }
  const [snapshot, setSnapshot] = createSignal<OverlayState>(state)
  const callbacks = new Map<symbol, OverlayCallbacks>()
  const getTopDialogId = () => state.dialogIds.at(-1)
  const getTopOverlayId = () => state.popup?.id ?? getTopDialogId()
  const eventOwners = new WeakMap<KeyboardEvent, symbol>()
  const onKeyDownCapture = (event: KeyboardEvent) => {
    const id = getTopOverlayId()
    if (id) eventOwners.set(event, id)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const id = eventOwners.get(event)
    if (id && id === getTopOverlayId() && !event.defaultPrevented) callbacks.get(id)?.onKeyDown(event)
  }

  function updateState(next: OverlayState) {
    state = next
    setSnapshot(next)
  }

  function dismissPopup(): void {
    const popup = state.popup
    if (!popup) return
    updateState({
      dialogIds: state.dialogIds,
    })
    callbacks.get(popup.id)?.onDismiss()
  }

  function createOverlay(kind: OverlayKind, options: OverlayOptions): OverlayHandle {
    const id = Symbol('overlay')
    let entry: OverlayEntry | undefined
    createEffect(options.open, (open) => {
      if (!open) return
      entry = {
        id,
        ownerDialogId: getTopDialogId(),
        returnFocusTarget: options.getReturnFocusTarget
          ? options.getReturnFocusTarget()
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : undefined,
      }
      const returnFocusTarget = state.popup?.returnFocusTarget ?? entry.returnFocusTarget
      dismissPopup()
      if (!callbacks.size) {
        document.addEventListener('keydown', onKeyDownCapture, true)
        document.addEventListener('keydown', onKeyDown)
      }
      callbacks.set(id, options)
      if (kind === 'dialog')
        updateState({
          dialogIds: [...state.dialogIds, id],
        })
      else
        updateState({
          dialogIds: state.dialogIds,
          popup: entry,
        })
      queueMicrotask(() => {
        if (getTopOverlayId() === id) options.onFocus()
      })
      return () => {
        const wasTopDialog = getTopDialogId() === id
        if (kind === 'dialog') {
          if (state.popup?.ownerDialogId === id) dismissPopup()
          updateState({
            ...state,
            dialogIds: state.dialogIds.filter((dialogId) => dialogId !== id),
          })
        } else if (state.popup?.id === id) {
          updateState({
            dialogIds: state.dialogIds,
          })
        }
        callbacks.delete(id)
        if (!callbacks.size) {
          document.removeEventListener('keydown', onKeyDownCapture, true)
          document.removeEventListener('keydown', onKeyDown)
        }
        const nextOverlayId = getTopOverlayId()
        if (wasTopDialog) {
          queueMicrotask(() => {
            if (getTopOverlayId() !== nextOverlayId) return
            if (returnFocusTarget && isAvailableForFocus(returnFocusTarget)) returnFocusTarget.focus()
            else if (nextOverlayId) callbacks.get(nextOverlayId)?.onFocus()
          })
        }
      }
    })
    return {
      isInteractive: () => {
        const current = snapshot()
        return current.dialogIds.at(-1) === id || current.popup?.id === id
      },
      getPortalMount: () => {
        const layer = kind === 'dialog' ? 'dialogs' : 'popups'
        const mount = document.querySelector<HTMLElement>(`[data-overlay-layer="${layer}"]`)
        if (!mount) throw new Error(`Overlay layer ${layer} is missing from the document`)
        return mount
      },
      queueFocusRestore: (element) => {
        const registeredEntry = entry
        if (!registeredEntry) return
        queueMicrotask(() => {
          if ((getTopOverlayId() === id || getTopOverlayId() === registeredEntry.ownerDialogId) && element && isAvailableForFocus(element))
            element.focus()
        })
      },
    }
  }

  return {
    createOverlay,
  }
}

interface OverlayOptions extends OverlayCallbacks {
  open(): boolean
  getReturnFocusTarget?(): HTMLElement | undefined
}

export interface OverlayHandle {
  isInteractive(): boolean
  getPortalMount(): HTMLElement
  queueFocusRestore(element: HTMLElement | undefined): void
}

export function createOverlay(kind: OverlayKind, options: OverlayOptions): OverlayHandle {
  let coordinator = coordinators.get(document)
  if (!coordinator) {
    coordinator = createOverlayCoordinator(document)
    coordinators.set(document, coordinator)
  }
  return coordinator.createOverlay(kind, options)
}

interface PopupOverlayOptions {
  open(): boolean
  onDismiss(): void
  trigger(): HTMLElement | undefined
  content(): HTMLElement | undefined
}

export function createPopupOverlay(options: PopupOverlayOptions): OverlayHandle {
  const overlay = createOverlay('popup', {
    open: options.open,
    onDismiss: options.onDismiss,
    getReturnFocusTarget: options.trigger,
    onFocus: () => options.content()?.querySelector<HTMLElement>('button:not([disabled])')?.focus(),
    onKeyDown: (event) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return
      event.preventDefault()
      options.onDismiss()
      overlay.queueFocusRestore(options.trigger())
    },
  })
  createEffect(options.open, (open) => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (options.content()?.contains(target) || options.trigger()?.contains(target))) return
      options.onDismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  })
  return overlay
}

export function trapOverlayFocus(event: KeyboardEvent, content: HTMLElement) {
  if (event.key !== 'Tab') return
  const focusable = [
    ...content.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ].filter(isAvailableForFocus)
  event.preventDefault()
  if (!focusable.length) {
    content.focus()
    return
  }
  const current = document.activeElement instanceof HTMLElement ? focusable.indexOf(document.activeElement) : -1
  const next = event.shiftKey ? (current <= 0 ? focusable.length - 1 : current - 1) : (current + 1) % focusable.length
  focusable[next].focus()
}
