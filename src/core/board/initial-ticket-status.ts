import { ValidationError } from '../shared/errors.js';
import type { ProjectRegistry } from '../project/project-registry.js';
import type { BoardConfigManager } from '../project/board-config.js';

export function resolveInitialTicketStatus(
  projectSlug: string,
  deps: {
    projectRegistry: Pick<ProjectRegistry, 'getBoardId'>;
    boardConfigManager: Pick<BoardConfigManager, 'getConfig'>;
  },
): string {
  const boardId = deps.projectRegistry.getBoardId(projectSlug);
  const columns = deps.boardConfigManager.getConfig(boardId).columns;
  if (columns.length === 0) {
    throw new ValidationError('Board has no columns configured');
  }
  return columns[0].name;
}
