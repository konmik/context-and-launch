import { ProcessError } from '../shared/errors.js';
import type { CommandTemplateKey } from '../command-template/command-template-definitions.js';
import type { CommandTemplateExecutor, CommandTemplateValues } from '../command-template/command-template-types.js';

export type MergeTreeResult =
	| { status: 'clean'; tree: string }
	| { status: 'conflicted' };

/**
 * Compute the tree produced by merging two refs without touching the index or worktree.
 * git merge-tree exits 0 when the merge is clean, 1 when it completed with conflicts,
 * and anything else when it could not be performed. `exitedWith` is what makes that
 * contract usable: it guarantees the 1 came from git rather than from a missing
 * interpreter or a timeout, both of which would otherwise look identical.
 */
export async function writeMergeTree(
	commands: CommandTemplateExecutor,
	templateKey: CommandTemplateKey,
	cwd: string,
	values: CommandTemplateValues,
): Promise<MergeTreeResult> {
	try {
		const tree = (await commands.execute(templateKey, cwd, values)).trim().split('\n')[0];
		return { status: 'clean', tree };
	} catch (error) {
		if (error instanceof ProcessError && error.exitedWith(1)) {
			return { status: 'conflicted' };
		}
		throw error;
	}
}
