import { errorPayload } from "../shared/errors.js";
import type { ErrorInfo } from "../shared/errors.js";
import type { FindHerdrAgentResult, HerdrAgentTarget } from "../launcher/herdr-control.js";

export type CleanupItemKey =
	"stopHerdrAgent" | "deleteWorktree" | "deleteLocalBranch" | "deleteRemoteBranch";

export type CleanupCheckItem =
	| { state: "ready" }
	| { state: "blocked"; reason: string; warning?: true }
	| { state: "error"; error: ErrorInfo };

export type TicketCleanupStatus = Record<CleanupItemKey, CleanupCheckItem>;

export type TicketCleanupOptions = Record<CleanupItemKey, boolean>;

export interface TicketCleanupCheckTarget {
	projectSlug: string;
	folderName: string;
	projectPath: string;
	worktreePath: string;
	branchName: string;
	configuredMainBranch?: string;
}

export interface TicketCleanupCheckDeps {
	worktreeExists(worktreePath: string): boolean;
	isWorktreeClean(worktreePath: string): Promise<boolean>;
	isWorktreeBusy(worktreePath: string): Promise<boolean>;
	localBranchExists(projectPath: string, branchName: string): Promise<boolean>;
	isBranchMerged(projectPath: string, branchName: string, configuredBranch?: string): Promise<boolean>;
	hasRemoteBranch(projectPath: string, branchName: string): Promise<boolean>;
	findHerdrAgent(target: HerdrAgentTarget): Promise<FindHerdrAgentResult>;
}

async function guard(body: () => Promise<CleanupCheckItem>): Promise<CleanupCheckItem> {
	try {
		return await body();
	} catch (e) {
		return { state: "error", error: errorPayload(e) };
	}
}

export async function runTicketCleanupChecks(
	target: TicketCleanupCheckTarget,
	deps: TicketCleanupCheckDeps,
): Promise<TicketCleanupStatus> {
	const stopHerdrAgent = guard(async () => {
		const found = await deps.findHerdrAgent({
			projectSlug: target.projectSlug,
			folderName: target.folderName,
			agentWorktreePath: target.worktreePath,
		});
		if (found.kind === "herdr-missing") return { state: "blocked", reason: "Herdr is not installed" };
		if (found.kind === "no-agent") return { state: "blocked", reason: "No Herdr agent" };
		return { state: "ready" };
	});

	const deleteWorktree = guard(async () => {
		if (!deps.worktreeExists(target.worktreePath)) {
			return { state: "blocked", reason: "No worktree" };
		}
		if (!await deps.isWorktreeClean(target.worktreePath)) {
			return { state: "blocked", reason: "Worktree has uncommitted changes" };
		}
		if (await deps.isWorktreeBusy(target.worktreePath)) {
			const herdr = await stopHerdrAgent;
			return {
				state: "blocked",
				warning: true,
				reason: herdr.state === "ready"
					? "Worktree is in use by another process (a Herdr agent is running in it)"
					: "Worktree is in use by another process",
			};
		}
		return { state: "ready" };
	});

	const deleteLocalBranch = guard(async () => {
		if (!await deps.localBranchExists(target.projectPath, target.branchName)) {
			return { state: "blocked", reason: "No local branch" };
		}
		if (!await deps.isBranchMerged(target.projectPath, target.branchName, target.configuredMainBranch)) {
			return { state: "blocked", reason: "Branch has unmerged commits", warning: true };
		}
		return { state: "ready" };
	});

	const deleteRemoteBranch = guard(async () => {
		if (!await deps.hasRemoteBranch(target.projectPath, target.branchName)) {
			return { state: "blocked", reason: "No remote branch" };
		}
		return { state: "ready" };
	});

	const [herdr, worktree, local, remote] = await Promise.all([
		stopHerdrAgent, deleteWorktree, deleteLocalBranch, deleteRemoteBranch,
	]);
	return {
		stopHerdrAgent: herdr,
		deleteWorktree: worktree,
		deleteLocalBranch: local,
		deleteRemoteBranch: remote,
	};
}
