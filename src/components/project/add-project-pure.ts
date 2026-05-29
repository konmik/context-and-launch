export interface ProjectPathsPreview {
  projectSlug: string;
  ticketsPath: string;
  defaultWorktreesPath: string;
}

export function applyPreview(
  preview: ProjectPathsPreview | null,
  ticketsTouched: boolean,
  worktreeTouched: boolean,
): { ticketsRootPath?: string; worktreeRootPath?: string } {
  if (!preview) return {};
  const result: { ticketsRootPath?: string; worktreeRootPath?: string } = {};
  if (!ticketsTouched) result.ticketsRootPath = preview.ticketsPath;
  if (!worktreeTouched) result.worktreeRootPath = preview.defaultWorktreesPath;
  return result;
}
