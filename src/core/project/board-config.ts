import type { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { slugifyColumnName } from '../../lib/slugify.js';

export { slugifyColumnName };

export interface ColumnDefinition {
	name: string;
	description?: string;
}

export interface BoardDefinition {
	id: string;
	name: string;
	columns: ColumnDefinition[];
}

export interface BoardConfig {
	columns: ColumnDefinition[];
}

export function validateColumnName(name: string, existingNames: string[], renamingFrom?: string): string {
	const slugified = slugifyColumnName(name);
	if (!slugified) {
		throw new Error('Column name must not be empty');
	}
	if (slugified === 'undefined') {
		throw new Error('Column name "undefined" is reserved');
	}
	const others = renamingFrom
		? existingNames.filter(n => n !== renamingFrom)
		: existingNames;
	if (others.includes(slugified)) {
		throw new Error(`Column name "${slugified}" already exists`);
	}
	return slugified;
}

function migrateColumns(columns: unknown[]): ColumnDefinition[] {
	return columns.map(c => {
		if (typeof c === 'string') return { name: c };
		if (typeof c === 'object' && c !== null && 'name' in c) return c as ColumnDefinition;
		return { name: String(c) };
	});
}

export class BoardConfigManager {
	private paths: ConfigPaths;
	private configRepo: ConfigRepository;

	constructor(paths: ConfigPaths, configRepo?: ConfigRepository) {
		this.paths = paths;
		this.configRepo = configRepo ?? new ConfigRepository();
	}

	private loadAll(): BoardDefinition[] {
		const filePath = this.paths.boardsFile();
		const raw = this.configRepo.readJson(filePath);
		if (raw === null) {
			throw new Error(`boards.json not found: ${filePath}`);
		}
		if (!Array.isArray(raw) || raw.length === 0) {
			throw new Error(`boards.json is empty or not an array: ${filePath}`);
		}
		for (const board of raw as BoardDefinition[]) {
			if (Array.isArray(board.columns)) {
				board.columns = migrateColumns(board.columns);
			}
		}
		return raw as BoardDefinition[];
	}

	private saveAll(boards: BoardDefinition[]): void {
		this.configRepo.writeJson(this.paths.boardsFile(), boards);
	}

	private findBoard(boardId: string): { boards: BoardDefinition[]; board: BoardDefinition; index: number } {
		const boards = this.loadAll();
		const index = boards.findIndex(b => b.id === boardId);
		if (index < 0) throw new Error(`Board not found: ${boardId}`);
		return { boards, board: boards[index], index };
	}

	listBoards(): BoardDefinition[] {
		return this.loadAll();
	}

	getBoard(boardId: string): BoardDefinition | undefined {
		return this.loadAll().find(b => b.id === boardId);
	}

	getDefaultBoardId(): string {
		return this.loadAll()[0].id;
	}

	getConfig(boardId?: string | null): BoardConfig {
		const boards = this.loadAll();
		const id = boardId || boards[0].id;
		const board = boards.find(b => b.id === id);
		if (!board) {
			return { columns: boards[0].columns };
		}
		return { columns: board.columns };
	}

	createBoard(name: string): BoardDefinition {
		const id = slugifyColumnName(name);
		if (!id) throw new Error('Board name must not be empty');
		if (id === 'undefined') throw new Error('Board name "undefined" is reserved');
		const boards = this.loadAll();
		if (boards.some(b => b.id === id)) {
			throw new Error(`Board with id "${id}" already exists`);
		}
		const board: BoardDefinition = { id, name: name.trim(), columns: [] };
		boards.push(board);
		this.saveAll(boards);
		return board;
	}

	deleteBoard(boardId: string): void {
		const boards = this.loadAll();
		if (boards.length <= 1) {
			throw new Error('Cannot delete the last board');
		}
		const index = boards.findIndex(b => b.id === boardId);
		if (index < 0) throw new Error(`Board not found: ${boardId}`);
		boards.splice(index, 1);
		this.saveAll(boards);
	}

	renameBoard(boardId: string, newName: string): void {
		const { boards, board } = this.findBoard(boardId);
		board.name = newName.trim();
		this.saveAll(boards);
	}

	addColumn(boardId: string, name: string, description?: string): ColumnDefinition {
		const { boards, board } = this.findBoard(boardId);
		const existingNames = board.columns.map(c => c.name);
		const slugified = validateColumnName(name, existingNames);
		const column: ColumnDefinition = { name: slugified };
		if (description != null && description.trim()) {
			column.description = description.trim();
		}
		board.columns.push(column);
		this.saveAll(boards);
		return column;
	}

	removeColumn(boardId: string, columnName: string): void {
		const { boards, board } = this.findBoard(boardId);
		const index = board.columns.findIndex(c => c.name === columnName);
		if (index < 0) throw new Error(`Column not found: ${columnName}`);
		board.columns.splice(index, 1);
		this.saveAll(boards);
	}

	updateColumn(boardId: string, columnName: string, patch: { description?: string }): void {
		const { boards, board } = this.findBoard(boardId);
		const column = board.columns.find(c => c.name === columnName);
		if (!column) throw new Error(`Column not found: ${columnName}`);
		if (patch.description != null) {
			column.description = patch.description.trim() || undefined;
		}
		this.saveAll(boards);
	}

	renameColumn(boardId: string, oldName: string, newName: string): { oldName: string; newName: string } {
		const { boards, board } = this.findBoard(boardId);
		const column = board.columns.find(c => c.name === oldName);
		if (!column) throw new Error(`Column not found: ${oldName}`);
		const existingNames = board.columns.map(c => c.name);
		const slugified = validateColumnName(newName, existingNames, oldName);
		column.name = slugified;
		this.saveAll(boards);
		return { oldName, newName: slugified };
	}

	reorderColumns(boardId: string, orderedNames: string[]): void {
		const { boards, board } = this.findBoard(boardId);
		const existing = new Set(board.columns.map(c => c.name));
		const ordered = new Set(orderedNames);
		if (existing.size !== ordered.size || ![...existing].every(n => ordered.has(n))) {
			throw new Error('Ordered names must match existing column names exactly');
		}
		const columnMap = new Map(board.columns.map(c => [c.name, c]));
		board.columns = orderedNames.map(n => columnMap.get(n)!);
		this.saveAll(boards);
	}
}
