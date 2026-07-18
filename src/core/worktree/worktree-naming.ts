const MAX_WORKTREE_FOLDER_LENGTH = 50;

export function worktreeFolderName(ticketFolderName: string): string {
	if (ticketFolderName.length <= MAX_WORKTREE_FOLDER_LENGTH) return ticketFolderName;
	return ticketFolderName.slice(0, MAX_WORKTREE_FOLDER_LENGTH).replace(/-+$/, '');
}

export function worktreeBranchName(ticketFolderName: string, branchPrefix?: string): string {
	const folder = worktreeFolderName(ticketFolderName);
	return branchPrefix ? `${branchPrefix}/${folder}` : folder;
}

export interface AgentWorktreeLocation {
	worktreePath: string;
	branchName: string;
}

export function resolveAgentWorktreeLocation(
	ticketFolderName: string,
	settings: { worktreeRootPath: string; branchPrefix?: string },
	saved?: { savedWorktreePath?: string; savedBranchName?: string },
): AgentWorktreeLocation {
	return {
		worktreePath: saved?.savedWorktreePath
			?? `${settings.worktreeRootPath}/${worktreeFolderName(ticketFolderName)}`,
		branchName: saved?.savedBranchName
			?? worktreeBranchName(ticketFolderName, settings.branchPrefix),
	};
}
