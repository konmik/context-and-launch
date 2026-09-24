import * as v from 'valibot';
import type { JsonValue } from '../shared/json.js';
import { slugifyColumnName } from '../../lib/slugify.js';
import { requireColumnColor } from './column-color-palette.js';

export interface ColumnDefinition {
	name: string;
	description?: string;
	color?: string;
}

export interface BoardDefinition {
	id: string;
	name: string;
	columns: ColumnDefinition[];
}

const schema = v.array(v.looseObject({
	id: v.string(), name: v.string(),
	columns: v.array(v.looseObject({
		name: v.string(), description: v.optional(v.string()), color: v.optional(v.string()),
	})),
}));

export function decodeBoards(raw: JsonValue): BoardDefinition[] {
	const parsed = v.safeParse(schema, raw);
	if (!parsed.success || !parsed.output.length) throw new Error('boards.json is empty or not an array');
	return parsed.output;
}

export function validateColumnName(name: string, existingNames: string[], renamingFrom?: string): string {
	const columnSlug = slugifyColumnName(name);
	if (!columnSlug) throw new Error('Column name must not be empty');
	if (columnSlug === 'undefined') throw new Error('Column name "undefined" is reserved');
	if (existingNames.some(n => n !== renamingFrom && n === columnSlug)) {
		throw new Error(`Column name "${columnSlug}" already exists`);
	}
	return columnSlug;
}

export function validateBoards(boards: BoardDefinition[]): void {
	const ids = new Set<string>();
	for (const board of boards) {
		if (!board.id || board.id === 'undefined') throw new Error('Board id must not be empty or reserved');
		if (ids.has(board.id)) throw new Error(`Board with id "${board.id}" already exists`);
		ids.add(board.id);
		const names: string[] = [];
		for (const column of board.columns) {
			if (validateColumnName(column.name, names) !== column.name) {
				throw new Error('Column name must be slugified');
			}
			names.push(column.name);
			if (column.color) requireColumnColor(column.color);
		}
	}
}
