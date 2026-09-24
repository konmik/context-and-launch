import { createContext } from 'solid-js';
import type { BoardDefinition } from '~/core/project/board-config-data.js';
import type { StoredSignal } from '~/util/stored-signal.js';
import { createStoredConfig } from '~/util/stored-config.js';
import { readBoards, saveBoards, releaseBoards } from './board-api.js';

export const BoardConfigContext = createContext<StoredSignal<BoardDefinition[]>>();

export function createBoardConfigStorage(): StoredSignal<BoardDefinition[]> {
	return createStoredConfig(readBoards, saveBoards, releaseBoards);
}
