import { createEffect, createSignal } from 'solid-js'

type OverlayKind = 'modal' | 'dropdown'

interface OverlayEntry {
  id: symbol
  kind: OverlayKind
  returnFocus?: HTMLElement
}

interface OverlayCommands {
  dismiss(): void
  keydown(event: KeyboardEvent): void
  focus(): void
}

interface OverlayCoordinator {
  register(entry: OverlayEntry, commands: OverlayCommands): () => void
  visible(id: symbol): boolean
  top(): symbol | undefined
  modal(): symbol | undefined
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
  let entries: OverlayEntry[] = []
  const [snapshot, setSnapshot] = createSignal<OverlayEntry[]>([])
  const commands = new Map<symbol, OverlayCommands>()
  const top = () => entries.at(-1)?.id
  const eventOwners = new WeakMap<KeyboardEvent, symbol>()
  const captureKeydown = (event: KeyboardEvent) => {
    const id = top()
    if (id) eventOwners.set(event, id)
  }
  const keydown = (event: KeyboardEvent) => {
    const id = eventOwners.get(event)
    if (id && id === top() && !event.defaultPrevented) commands.get(id)?.keydown(event)
  }

  function updateEntries(next: OverlayEntry[]) {
    entries = next
    setSnapshot(next)
  }

  function register(entry: OverlayEntry, handlers: OverlayCommands): () => void {
    const dropdown = entries.find((item) => item.kind === 'dropdown')
    if (dropdown) {
      commands.get(dropdown.id)?.dismiss()
      updateEntries(entries.filter((item) => item.id !== dropdown.id))
    }
    if (!commands.size) {
      document.addEventListener('keydown', captureKeydown, true)
      document.addEventListener('keydown', keydown)
    }
    commands.set(entry.id, handlers)
    updateEntries([...entries, entry])
    queueMicrotask(() => {
      if (top() === entry.id) handlers.focus()
    })
    return () => {
      const wasTop = top() === entry.id
      updateEntries(entries.filter((item) => item.id !== entry.id))
      commands.delete(entry.id)
      if (!commands.size) {
        document.removeEventListener('keydown', captureKeydown, true)
        document.removeEventListener('keydown', keydown)
      }
      const next = top()
      if (wasTop && entry.kind === 'modal') {
        queueMicrotask(() => {
          if (top() !== next) return
          if (entry.returnFocus && isAvailableForFocus(entry.returnFocus)) entry.returnFocus.focus()
          else if (next) commands.get(next)?.focus()
        })
      }
    }
  }

  return {
    register,
    top,
    modal: () => entries.findLast((entry) => entry.kind === 'modal')?.id,
    visible: (id) => {
      const current = snapshot()
      return current.findLast((entry) => entry.kind === 'modal')?.id === id || current.at(-1)?.id === id
    },
  }
}

interface OverlayOptions extends OverlayCommands {
  open(): boolean
}

export interface OverlayHandle {
  visible(): boolean
  restoreFocus(element: HTMLElement | undefined): void
}

export function createOverlay(kind: OverlayKind, options: OverlayOptions): OverlayHandle {
  let coordinator = coordinators.get(document)
  if (!coordinator) {
    coordinator = createOverlayCoordinator(document)
    coordinators.set(document, coordinator)
  }
  const manager = coordinator
  const id = Symbol('overlay')
  let parent: symbol | undefined
  createEffect(options.open, (open) => {
    if (!open) return
    parent = manager.modal()
    return manager.register(
      {
        id,
        kind,
        returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : undefined,
      },
      options,
    )
  })
  return {
    visible: () => manager.visible(id),
    restoreFocus: (element) => {
      queueMicrotask(() => {
        if (manager.top() === id || manager.top() === parent) element?.focus()
      })
    },
  }
}

interface DropdownOptions {
  open(): boolean
  dismiss(): void
  trigger(): HTMLElement | undefined
  content(): HTMLElement | undefined
}

export function createDropdownOverlay(options: DropdownOptions): OverlayHandle {
  const overlay = createOverlay('dropdown', {
    open: options.open,
    dismiss: options.dismiss,
    focus: () => options.content()?.querySelector<HTMLElement>('button:not([disabled])')?.focus(),
    keydown: (event) => {
      if (event.key !== 'Escape' && event.key !== 'Tab') return
      event.preventDefault()
      options.dismiss()
      overlay.restoreFocus(options.trigger())
    },
  })
  createEffect(options.open, (open) => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (options.content()?.contains(target) || options.trigger()?.contains(target))) return
      options.dismiss()
    }
    document.addEventListener('pointerdown', dismiss, true)
    return () => document.removeEventListener('pointerdown', dismiss, true)
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
