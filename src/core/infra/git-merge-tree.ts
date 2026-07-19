import { ProcessError } from '../shared/errors.js';
import { git } from './git.js';

export type MergeTreeResult =
	| { status: 'clean'; tree: string }
	| { status: 'conflicted' };

/**
 * Compute the tree produced by merging two refs without touching the index or worktree.
 * Git defines exit 1 as a completed merge with conflicts; every other failure remains an error.
 */
export async function writeMergeTree(
	workDir: string,
	firstRef: string,
	secondRef: string,
): Promise<MergeTreeResult> {
	try {
		const tree = (await git(workDir, 'merge-tree', '--write-tree', firstRef, secondRef)).trim();
		return { status: 'clean', tree };
	} catch (error) {
		if (error instanceof ProcessError && error.exitCode === 1) {
			return { status: 'conflicted' };
		}
		throw error;
	}
}
