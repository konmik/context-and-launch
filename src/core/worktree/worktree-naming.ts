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
	isDefaultLocation: boolean;
}

export function resolveAgentWorktreeLocation(
	ticketFolderName: string,
	settings: { worktreeRootPath: string; branchPrefix?: string },
	saved?: { savedWorktreePath?: string; savedBranchName?: string },
): AgentWorktreeLocation {
	const defaultPath = `${settings.worktreeRootPath}/${worktreeFolderName(ticketFolderName)}`;
	const worktreePath = saved?.savedWorktreePath ?? defaultPath;
	return {
		worktreePath,
		isDefaultLocation: worktreePath === defaultPath,
		branchName: saved?.savedBranchName
			?? worktreeBranchName(ticketFolderName, settings.branchPrefix),
	};
}
