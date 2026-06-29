const MAX_WORKTREE_FOLDER_LENGTH = 50;

export function worktreeFolderName(ticketFolderName: string): string {
	if (ticketFolderName.length <= MAX_WORKTREE_FOLDER_LENGTH) return ticketFolderName;
	return ticketFolderName.slice(0, MAX_WORKTREE_FOLDER_LENGTH).replace(/-+$/, '');
}

export function worktreeBranchName(ticketFolderName: string, branchPrefix?: string): string {
	const folder = worktreeFolderName(ticketFolderName);
	return branchPrefix ? `${branchPrefix}/${folder}` : folder;
}
