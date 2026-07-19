import { describe, it, expect, vi } from "vitest";
import {
	runTicketCleanupChecks,
	type TicketCleanupCheckDeps,
	type TicketCleanupCheckTarget,
} from "./ticket-cleanup-checks.js";
import type { FindHerdrAgentResult } from "../launcher/herdr-control.js";

const target: TicketCleanupCheckTarget = {
	projectSlug: "alpha",
	folderName: "st-1",
	projectPath: "/repo",
	worktreePath: "/wt/st-1",
	branchName: "st-1",
	configuredMainBranch: "main",
};

function makeDeps(overrides: Partial<TicketCleanupCheckDeps> = {}): TicketCleanupCheckDeps {
	return {
		worktreeExists: () => true,
		isWorktreeClean: async () => true,
		isWorktreeBusy: async () => false,
		localBranchExists: async () => true,
		isBranchMerged: async () => true,
		hasRemoteBranch: async () => true,
		findHerdrAgent: async (): Promise<FindHerdrAgentResult> =>
			({ kind: "agent", paneId: "w1:p1", agentStatus: "working" }),
		...overrides,
	};
}

describe("runTicketCleanupChecks", () => {
	it("marks every item ready when all predicates are favorable and an agent exists", async () => {
		const findHerdrAgent = vi.fn(async (): Promise<FindHerdrAgentResult> =>
			({ kind: "agent", paneId: "w1:p1", agentStatus: "working" }));
		const status = await runTicketCleanupChecks(target, makeDeps({ findHerdrAgent }));
		expect(status).toEqual({
			stopHerdrAgent: { state: "ready" },
			deleteWorktree: { state: "ready" },
			deleteLocalBranch: { state: "ready" },
			deleteRemoteBranch: { state: "ready" },
		});
		expect(findHerdrAgent).toHaveBeenCalledWith({
			projectSlug: "alpha",
			folderName: "st-1",
			agentWorktreePath: "/wt/st-1",
		});
	});

	it("blocks stopHerdrAgent with 'Herdr is not installed' when herdr is missing", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({
			findHerdrAgent: async () => ({ kind: "herdr-missing" }),
		}));
		expect(status.stopHerdrAgent).toEqual({ state: "blocked", reason: "Herdr is not installed" });
	});

	it("blocks stopHerdrAgent with 'No Herdr agent' when there is no agent", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({
			findHerdrAgent: async () => ({ kind: "no-agent" }),
		}));
		expect(status.stopHerdrAgent).toEqual({ state: "blocked", reason: "No Herdr agent" });
	});

	it("blocks deleteWorktree with 'No worktree' when the worktree is missing", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({ worktreeExists: () => false }));
		expect(status.deleteWorktree).toEqual({
			state: "blocked", reason: "No worktree",
		});
	});

	it("blocks deleteWorktree when the worktree has uncommitted changes", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({ isWorktreeClean: async () => false }));
		expect(status.deleteWorktree).toEqual({
			state: "blocked", reason: "Worktree has uncommitted changes",
		});
	});

	it("mentions the running agent when a busy worktree also has an agent", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({ isWorktreeBusy: async () => true }));
		expect(status.deleteWorktree).toEqual({
			state: "blocked",
			reason: "Worktree is in use by another process\n(a Herdr agent is running in it)",
			warning: true,
		});
	});

	it("omits the parenthetical when a busy worktree has no agent", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({
			isWorktreeBusy: async () => true,
			findHerdrAgent: async () => ({ kind: "no-agent" }),
		}));
		expect(status.deleteWorktree).toEqual({
			state: "blocked", reason: "Worktree is in use by another process", warning: true,
		});
	});

	it("omits the parenthetical when a busy worktree's herdr check errored", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({
			isWorktreeBusy: async () => true,
			findHerdrAgent: async () => { throw new Error("herdr broke"); },
		}));
		expect(status.deleteWorktree).toEqual({
			state: "blocked", reason: "Worktree is in use by another process", warning: true,
		});
	});

	it("blocks deleteLocalBranch with 'No local branch' when the branch is missing", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({ localBranchExists: async () => false }));
		expect(status.deleteLocalBranch).toEqual({ state: "blocked", reason: "No local branch" });
	});

	it("blocks deleteLocalBranch when the branch has unmerged commits", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({ isBranchMerged: async () => false }));
		expect(status.deleteLocalBranch).toEqual({
			state: "blocked", reason: "Branch has unmerged commits", warning: true,
		});
	});

	it("blocks deleteRemoteBranch with 'No remote branch' when there is no remote branch", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({ hasRemoteBranch: async () => false }));
		expect(status.deleteRemoteBranch).toEqual({ state: "blocked", reason: "No remote branch" });
	});

	it("isolates a rejecting isBranchMerged to deleteLocalBranch only", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({
			isBranchMerged: async () => { throw new Error("merge check failed"); },
		}));
		expect(status.deleteLocalBranch.state).toBe("error");
		if (status.deleteLocalBranch.state === "error") {
			expect(status.deleteLocalBranch.error.description).toBe("merge check failed");
		}
		expect(status.stopHerdrAgent.state).toBe("ready");
		expect(status.deleteWorktree.state).toBe("ready");
		expect(status.deleteRemoteBranch.state).toBe("ready");
	});

	it("isolates a throwing findHerdrAgent to stopHerdrAgent without corrupting deleteWorktree", async () => {
		const status = await runTicketCleanupChecks(target, makeDeps({
			findHerdrAgent: async () => { throw new Error("duplicate workspaces"); },
		}));
		expect(status.stopHerdrAgent.state).toBe("error");
		if (status.stopHerdrAgent.state === "error") {
			expect(status.stopHerdrAgent.error.description).toBe("duplicate workspaces");
		}
		expect(status.deleteWorktree.state).toBe("ready");
	});

	it("does not call isBranchMerged when the local branch is missing", async () => {
		const isBranchMerged = vi.fn(async () => true);
		await runTicketCleanupChecks(target, makeDeps({
			localBranchExists: async () => false,
			isBranchMerged,
		}));
		expect(isBranchMerged).not.toHaveBeenCalled();
	});
});
