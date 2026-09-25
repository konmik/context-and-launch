export type TicketOrder = Record<string, string[]>;

export function moveTicketInOrder(
	order: TicketOrder, folderName: string, fromColumn: string, toColumn: string, newIndex: number,
) {
	const next = { ...order };
	for (const column of Object.keys(next)) next[column] = next[column].filter(folder => folder !== folderName);
	if (next[fromColumn]?.length === 0 && fromColumn !== toColumn && !Object.hasOwn(order, toColumn)) {
		delete next[fromColumn];
	}
	const destination = next[toColumn] ?? [];
	destination.splice(Math.max(0, Math.min(newIndex, destination.length)), 0, folderName);
	return { ...next, [toColumn]: destination };
}
