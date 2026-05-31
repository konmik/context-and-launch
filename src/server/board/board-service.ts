import { TicketStore } from "~/server/ticket/ticket-store.js";
import { errorMessage } from "~/server/shared/errors.js";
import type { ProjectRegistry } from "~/server/project/project-registry.js";
import type { BoardConfigManager } from "~/server/project/board-config.js";
import type { WorktreeManager } from "~/server/worktree/worktree-manager.js";
import type { FileWatcher } from "~/server/infra/file-watcher.js";
import type { LauncherConfigManager } from "~/server/launcher/launcher-config.js";
import type { TicketSyncManager } from "~/server/ticket/ticket-sync.js";
import type { BoardPageData } from "./board-types.js";

export class BoardService {
	constructor(
		private projectRegistry: ProjectRegistry,
		private boardConfigManager: BoardConfigManager,
		private worktreeManager: WorktreeManager,
		private fileWatcher: FileWatcher,
		private launcherConfigManager: LauncherConfigManager,
		private ticketSyncManager: TicketSyncManager,
	) {}

	async loadBoard(projectSlug: string): Promise<BoardPageData> {
		const projects = this.projectRegistry.listProjects();
		const project = projects.find((p) => p.projectSlug === projectSlug);

		if (!project) {
			return { status: 'not-found' as const, projects, projectSlug };
		}
		if (!project.available) {
			return {
				status: 'unavailable' as const, projects, projectSlug,
				projectPath: project.path,
			};
		}

		this.projectRegistry.setLastUsed(projectSlug);

		try {
			const worktreeDir = await this.worktreeManager.ensureWorktree(
				project.path, projectSlug, project.branch,
			);
			this.fileWatcher.stopAll();
			this.fileWatcher.watch(worktreeDir);
			const merged = this.launcherConfigManager.getMergedConfig(projectSlug);
			const config = this.boardConfigManager.getConfig(merged.boardId);
			const store = new TicketStore(worktreeDir);
			const { tickets, ticketOrder } = store.loadBoardState(
				config.columns.map(c => c.name),
			);
			const suggestedNextNumber = store.suggestNextNumber();
			await this.ticketSyncManager.finalizeResolution(worktreeDir);
			const hasRemote = await this.ticketSyncManager.hasRemote(worktreeDir);
			const hasConflict = this.ticketSyncManager.isResolving(worktreeDir);
			return {
				status: 'loaded' as const,
				projects,
				projectSlug,
				board: { columns: config.columns, tickets, ticketOrder },
				projectPath: project.path,
				suggestedNextNumber,
				hasRemote,
				hasConflict,
			};
		} catch (e) {
			return {
				status: 'error' as const,
				projects,
				projectSlug,
				projectPath: project.path,
				error: errorMessage(e),
			};
		}
	}
}
