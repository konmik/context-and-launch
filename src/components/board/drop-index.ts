export interface HoverTarget {
  column: string;
  index: number;
}

export function computeDropIndex(
  cardRects: { top: number; height: number }[],
  cursorY: number,
  draggedIndex?: number,
): number {
  let cardsAboveCursor = 0;
  for (let i = 0; i < cardRects.length; i++) {
    if (i === draggedIndex) continue;
    const center = cardRects[i].top + cardRects[i].height / 2;
    if (cursorY < center) break;
    cardsAboveCursor++;
  }
  return cardsAboveCursor;
}

function compactedToFullIndex(compactedIndex: number, removedIndex: number): number {
  return compactedIndex < removedIndex ? compactedIndex : compactedIndex + 1;
}

export function resolvePreviewInsertBefore(
  hoverTarget: HoverTarget | null,
  columnName: string,
  sourceIndexInColumn: number | null,
): number | null {
  if (!hoverTarget || hoverTarget.column !== columnName) return null;

  const dropIndex = hoverTarget.index;
  const sourceIsInThisColumn = sourceIndexInColumn !== null;
  if (!sourceIsInThisColumn) return dropIndex;

  const dropsOntoOwnSlot = dropIndex === sourceIndexInColumn;
  if (dropsOntoOwnSlot) return null;

  return compactedToFullIndex(dropIndex, sourceIndexInColumn);
}

export function computeHoverTarget(
  columnRects: Map<string, { left: number; right: number }>,
  cardRectsByColumn: Map<string, { top: number; height: number }[]>,
  cursor: { x: number; y: number },
  dragSource?: { column: string; index: number },
): HoverTarget | null {
  let column: string | null = null;
  for (const [col, rect] of columnRects) {
    if (cursor.x >= rect.left && cursor.x <= rect.right) {
      column = col;
      break;
    }
  }
  if (!column) return null;

  const cardRects = cardRectsByColumn.get(column) ?? [];
  const draggedIndex = dragSource && dragSource.column === column ? dragSource.index : undefined;
  const index = computeDropIndex(cardRects, cursor.y, draggedIndex);
  return { column, index };
}
