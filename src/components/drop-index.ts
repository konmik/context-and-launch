export interface HoverTarget {
  column: string;
  index: number;
}

export function computeDropIndex(
  cardRects: { top: number; height: number }[],
  cursorY: number,
  skipIndex?: number,
): number {
  const filtered: { center: number; originalIndex: number }[] = [];
  for (let i = 0; i < cardRects.length; i++) {
    if (i === skipIndex) continue;
    const r = cardRects[i];
    filtered.push({ center: r.top + r.height / 2, originalIndex: i });
  }
  for (let i = 0; i < filtered.length; i++) {
    if (cursorY < filtered[i].center) {
      return filtered[i].originalIndex;
    }
  }
  return cardRects.length - (skipIndex !== undefined ? 1 : 0);
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
  const skipIndex = dragSource && dragSource.column === column ? dragSource.index : undefined;
  const index = computeDropIndex(cardRects, cursor.y, skipIndex);
  return { column, index };
}
