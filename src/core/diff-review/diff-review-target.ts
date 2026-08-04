import fs from "node:fs";
import path from "node:path";
import type { ProjectRegistry } from "../project/project-registry.js";
import type { WorktreeManager } from "../worktree/worktree-manager.js";
import type { LauncherConfigManager } from "../launcher/launcher-config.js";
import { TicketStore, type TicketInfo } from "../ticket/ticket-store.js";
import { resolveAgentWorktreeLocation } from "../worktree/worktree-naming.js";
import { NotFoundError } from "../shared/errors.js";
import type { DiffReviewTarget } from "./diff-review-git.js";

export interface ResolvedDiffReviewTarget extends DiffReviewTarget {
	projectSlug: string;
	folderName: string;
	branchName: string;
	ticket: TicketInfo;
}

function normalizeIdentityPath(value: string): string {
	const resolved = path.resolve(value);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function diffReviewWorktreeIdentity(worktreePath: string, branchName: string): string {
	return `${normalizeIdentityPath(worktreePath)}\0${branchName}`;
}

export class DiffReviewTargetResolver {
	constructor(
		private readonly projectRegistry: ProjectRegistry,
		private readonly worktreeManager: WorktreeManager,
		private readonly launcherConfigManager: LauncherConfigManager,
	) {}

	resolve(projectSlug: string, folderName: string): ResolvedDiffReviewTarget {
		const project = this.projectRegistry.listProjects()
			.find((candidate) => candidate.projectSlug === projectSlug);
		if (!project) throw new NotFoundError(`Project not found: ${projectSlug}`);
		const ticket = new TicketStore(this.worktreeManager.getWorktreeDir(projectSlug))
			.getTicket(folderName);
		if (!ticket) throw new NotFoundError(`Ticket not found: ${folderName}`);
		const location = resolveAgentWorktreeLocation(
			folderName,
			this.launcherConfigManager.resolveWorktreeSettings(projectSlug),
			{
				savedWorktreePath: ticket.agentWorktreeDir,
				savedBranchName: ticket.agentWorktreeBranchName,
			},
		);
		if (!fs.existsSync(location.worktreePath)) {
			throw new NotFoundError(`Agent Worktree does not exist: ${location.worktreePath}`);
		}
		return {
			projectSlug,
			folderName,
			ticket,
			worktreePath: location.worktreePath,
			branchName: location.branchName,
			mainBranch: project.mainBranch,
			worktreeIdentity: diffReviewWorktreeIdentity(
				location.worktreePath,
				location.branchName,
			),
		};
	}
}
