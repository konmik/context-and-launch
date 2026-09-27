import { createContext, useContext } from 'solid-js'
import type { JSX } from '@solidjs/web'
import type { DragId, DragItem } from './drag-types.js'

export interface DragContextValue {
  active: () => DragItem | undefined
  position: () =>
    | {
        x: number
        y: number
      }
    | undefined
  register(id: DragId, node: HTMLElement): void
  activators(id: DragId): DragActivators
}

export interface DragActivators {
  onPointerDown: JSX.EventHandler<HTMLElement, PointerEvent>
  onKeyDown: JSX.EventHandler<HTMLElement, KeyboardEvent>
}

export const DragContext = createContext<DragContextValue>()

export function createSortable(id: DragId): SortableResult {
  const drag = useContext(DragContext)
  return {
    ref: (node: HTMLElement) => drag.register(id, node),
    dragActivators: drag.activators(id),
  }
}

export function createDroppable(id: DragId): DroppableResult {
  const drag = useContext(DragContext)
  return {
    ref: (node: HTMLElement) => drag.register(id, node),
  }
}

export interface SortableResult {
  ref: (node: HTMLElement) => void
  dragActivators: DragActivators
}

export interface DroppableResult {
  ref: (node: HTMLElement) => void
}
