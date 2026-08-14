export type DragId = string | number;

export interface DragItem {
  id: DragId;
  node?: HTMLElement;
  transform?: { x: number; y: number };
}

export interface DragEvent {
  draggable: DragItem;
  droppable?: DragItem;
  overlay?: { node?: HTMLElement };
  intent?: "pointer" | "keyboard";
}
