export interface ProjectPathsPreview {
  projectSlug: string;
  ticketsPath: string;
  defaultWorktreesPath: string;
  mainBranch?: string;
}

export interface PreviewApplied {
  ticketsRootPath?: string;
  worktreeRootPath?: string;
  mainBranch?: string;
}

export function applyPreview(
  preview: ProjectPathsPreview | null,
  ticketsTouched: boolean,
  worktreeTouched: boolean,
  mainBranchTouched: boolean,
): PreviewApplied {
  if (!preview) return {};
  const result: PreviewApplied = {};
  if (!ticketsTouched) result.ticketsRootPath = preview.ticketsPath;
  if (!worktreeTouched) result.worktreeRootPath = preview.defaultWorktreesPath;
  if (!mainBranchTouched && preview.mainBranch !== undefined) result.mainBranch = preview.mainBranch;
  return result;
}
