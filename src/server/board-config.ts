import type { BoardConfig, BoardDefinition } from '../types.js';
import type { ConfigPaths } from './config-paths.js';

export const DEFAULT_BOARD_ID = 'kanban';

export const DEFAULT_BOARDS: BoardDefinition[] = [
	{ id: 'kanban', name: 'Kanban', columns: ['todo', 'prd', 'in-progress', 'review', 'done'] },
	{ id: 'simple', name: 'Simple', columns: ['todo', 'in-progress', 'done'] },
];

export class BoardConfigManager {
	private paths: ConfigPaths;

	constructor(paths: ConfigPaths) {
		this.paths = paths;
	}

	private loadAll(): BoardDefinition[] {
		const text = this.paths.readConfigFile(this.paths.boardsFile());
		if (text === null) {
			const defaults = structuredClone(DEFAULT_BOARDS);
			this.paths.writeConfigFile(this.paths.boardsFile(), JSON.stringify(defaults, null, 2));
			return defaults;
		}
		try {
			const parsed = JSON.parse(text);
			if (!Array.isArray(parsed) || parsed.length === 0) {
				return structuredClone(DEFAULT_BOARDS);
			}
			return parsed;
		} catch {
			return structuredClone(DEFAULT_BOARDS);
		}
	}

	listBoards(): BoardDefinition[] {
		return this.loadAll();
	}

	getBoard(boardId: string): BoardDefinition | undefined {
		return this.loadAll().find(b => b.id === boardId);
	}

	getConfig(boardId?: string | null): BoardConfig {
		const id = boardId || DEFAULT_BOARD_ID;
		const board = this.getBoard(id);
		if (!board) {
			const fallback = this.loadAll()[0];
			return { columns: fallback?.columns ?? DEFAULT_BOARDS[0].columns };
		}
		return { columns: board.columns };
	}
}
