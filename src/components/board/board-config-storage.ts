import { createContext, createMemo } from 'solid-js';
import type { BoardDefinition } from '~/core/project/board-config-data.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { transformConfig } from '~/util/transform-config.js';
import { readBoards, saveBoards, releaseBoards } from './board-api.js';

export const BoardConfigContext = createContext<StoredSignal<BoardDefinition[]>>();

export function createBoardConfigStorage(): StoredSignal<BoardDefinition[]> {
	const initial = createMemo(async () => {
		const result = await readBoards();
		if (result.type === 'Failure') throw new Error(result.error);
		return result.value;
	});
	return createStoredSignal(initial, transform => transformConfig(transform, readBoards, saveBoards, releaseBoards));
}
