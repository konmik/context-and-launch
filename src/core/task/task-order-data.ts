export type TaskOrder = Record<string, string[]>

export function moveTaskInOrder(
  order: TaskOrder,
  folderName: string,
  fromColumn: string,
  toColumn: string,
  newIndex: number,
): MoveTaskInOrderResult {
  const next = {
    ...order,
  }
  for (const column of Object.keys(next)) next[column] = next[column].filter((folder) => folder !== folderName)
  if (next[fromColumn]?.length === 0 && fromColumn !== toColumn && !Object.hasOwn(order, toColumn)) {
    delete next[fromColumn]
  }
  const destination = next[toColumn] ?? []
  destination.splice(Math.max(0, Math.min(newIndex, destination.length)), 0, folderName)
  return {
    ...next,
    [toColumn]: destination,
  }
}

export interface MoveTaskInOrderResult {
  [x: string]: string[]
}
