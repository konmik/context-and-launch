import type { ConfigPaths } from '../config/config-paths.js';
import { ConfigRepository } from '../config/config-repository.js';
import { UpdateLock } from '~/util/update-lock.js';
import { decodeBoards, validateBoards, type BoardDefinition, type ColumnDefinition } from './board-config-data.js';

export type { BoardDefinition, ColumnDefinition } from './board-config-data.js';
export { validateColumnName } from './board-config-data.js';
export { slugifyColumnName } from '../../lib/slugify.js';
export interface BoardConfig { columns: ColumnDefinition[] }

export class BoardConfigManager {
	constructor(
		private readonly paths: ConfigPaths,
		private readonly configRepo = new ConfigRepository(),
		private readonly lock = new UpdateLock(),
	) {}

	read(owner?: string): BoardDefinition[] {
		return this.lock.read(() => {
			const file = this.paths.boardsFile();
			const raw = this.configRepo.readJson(file);
			if (raw === null) throw new Error(`boards.json not found: ${file}`);
			return decodeBoards(raw);
		}, owner);
	}

	write(boards: BoardDefinition[], owner?: string): BoardDefinition[] {
		return this.lock.write(() => {
			const next = decodeBoards(boards);
			validateBoards(next);
			this.configRepo.writeJson(this.paths.boardsFile(), next);
			return next;
		}, owner);
	}

	release(owner: string): void { this.lock.release(owner); }

	getDefaultBoardId(): string { return this.read()[0].id; }

	getConfig(boardId?: string | null): BoardConfig {
		const boards = this.read();
		return { columns: (boards.find(board => board.id === boardId) ?? boards[0]).columns };
	}
}
