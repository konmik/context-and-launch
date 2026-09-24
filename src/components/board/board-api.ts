import {
	boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
} from '~/core/config/instances.js';
import { migrateColumnRename, type MigrationScope } from '~/core/project/column-rename-migration.js';
import { errorMessage } from '~/core/shared/errors.js';
import type { BoardDefinition } from '~/core/project/board-config-data.js';
import { fail, succeed, type Result } from '~/util/result.js';

export type BoardRef = Pick<BoardDefinition, 'id' | 'name'>;

export async function readBoards(owner?: string): Promise<Result<BoardDefinition[], string>> {
	'use server';
	try { return succeed(boardConfigManager.read(owner)); }
	catch (error) { return fail(errorMessage(error)); }
}

export async function releaseBoards(owner: string): Promise<void> {
	'use server';
	boardConfigManager.release(owner);
}

export async function saveBoards(json: string, owner: string): Promise<Result<BoardDefinition[], string>> {
	'use server';
	try {
		if (!owner) return fail('Configuration update requires a client identity.');
		return succeed(boardConfigManager.write(JSON.parse(json), owner));
	} catch (error) { return fail(errorMessage(error)); }
}

export async function migrateRenamedColumn(
	boardId: string, oldName: string, newName: string, scope: MigrationScope, currentProjectSlug: string,
): Promise<Result<void, string>> {
	'use server';
	try {
		if (scope === 'current' && !currentProjectSlug) throw new Error('Missing current project');
		migrateColumnRename(boardId, oldName, newName, scope, currentProjectSlug, {
			boardConfigManager, projectRegistry, launcherConfigManager, worktreeManager,
		});
		return succeed(undefined);
	} catch (error) { return fail(errorMessage(error)); }
}
