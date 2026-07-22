import fs from "fs";
import { TicketStore } from "~/core/ticket/ticket-store.js";
import { resolveAgentWorktreeLocation } from "~/core/worktree/worktree-naming.js";
import { errorMessage } from "~/core/shared/errors.js";
import type { ProjectRegistry } from "~/core/project/project-registry.js";
import type { BoardConfigManager } from "~/core/project/board-config.js";
import type { WorktreeManager } from "~/core/worktree/worktree-manager.js";
import type { LauncherConfigManager } from "~/core/launcher/launcher-config.js";
import type { FileWatcher } from "~/core/infra/file-watcher.js";
import type { TicketSyncManager } from "~/core/ticket/ticket-sync.js";
import type { ProjectPageData } from "./board-types.js";

export class ProjectPageService {
	constructor(
		private projectRegistry: ProjectRegistry,
		private boardConfigManager: BoardConfigManager,
		private worktreeManager: WorktreeManager,
		private fileWatcher: FileWatcher,
		private ticketSyncManager: TicketSyncManager,
		private launcherConfigManager: LauncherConfigManager,
	) {}

	async loadProjectPage(projectSlug: string): Promise<ProjectPageData> {
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

		try {
			const worktreeDir = await this.worktreeManager.ensureWorktree(
				project.path, projectSlug, project.branch,
			);
			this.fileWatcher.watch(worktreeDir);
			await this.ticketSyncManager.finalizeResolution(worktreeDir);
			const config = this.boardConfigManager.getConfig(project.boardId);
			const store = new TicketStore(worktreeDir);
			const { tickets, ticketOrder } = store.loadBoardState(
				config.columns.map(c => c.name),
			);
			const worktreeSettings = this.launcherConfigManager.resolveWorktreeSettings(projectSlug);
			for (const ticket of tickets) {
				const { worktreePath } = resolveAgentWorktreeLocation(
					ticket.folderName, worktreeSettings,
					{ savedWorktreePath: ticket.agentWorktreeDir },
				);
				ticket.hasAgentWorktree = fs.existsSync(worktreePath);
			}
			const suggestedNextNumber = store.suggestNextNumber();
			const hasRemote = await this.ticketSyncManager.hasRemote(worktreeDir);
			const hasConflict = await this.ticketSyncManager.detectConflict(worktreeDir);
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
