import type { DragId } from "~/components/drag/drag-types.js";

export const COLUMN_PREFIX = "column:";

export function parseId(id: DragId) {
	const str = String(id);
	const sep = str.indexOf(":");
	return { column: str.slice(0, sep), folderName: str.slice(sep + 1) };
}

export function makeId(column: string, folderName: string): string {
	return `${column}:${folderName}`;
}
