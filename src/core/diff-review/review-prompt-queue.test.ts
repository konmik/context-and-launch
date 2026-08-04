import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigPaths } from "../config/config-paths.js";
import { ConfigRepository } from "../config/config-repository.js";
import { makeTempDir, removeTempDirOrWarn } from "../../test-temp.js";
import { buildReviewFile, buildReviewPromptSnapshot } from "./diff-review-model.js";
import { DiffReviewStore } from "./diff-review-store.js";
import { ReviewPromptQueueService } from "./review-prompt-queue.js";
import type { ResolvedDiffReviewTarget } from "./diff-review-target.js";

const dirs: string[] = [];

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
});

afterEach(async () => {
	vi.clearAllTimers();
	vi.useRealTimers();
	await Promise.all(dirs.splice(0).map(removeTempDirOrWarn));
});

function setupQueue() {
	const baseDir = makeTempDir("review-prompt-queue-");
	dirs.push(baseDir);
	const store = new DiffReviewStore(new ConfigPaths(baseDir), new ConfigRepository());
	const file = buildReviewFile({
		path: "src/a.ts",
		changeType: "modified",
		oldContents: "old\n",
		newContents: "new\n",
		byteSize: 4,
	});
	const snapshot = buildReviewPromptSnapshot(
		file,
		{ start: 1, end: 1, side: "additions" },
		"working",
		"revision",
	);
	const target: ResolvedDiffReviewTarget = {
		projectSlug: "project",
		folderName: "st-1-ticket",
		worktreePath: "C:/worktree",
		worktreeIdentity: "worktree",
		branchName: "st-1-ticket",
		mainBranch: "main",
		ticket: {
			number: "ST-1",
			title: "Ticket",
			status: "in-progress",
			folderName: "st-1-ticket",
			contextNames: [],
			useWorktree: true,
			hasAgentWorktree: true,
			fileNames: [],
			references: [],
		},
	};
	const execute = vi.fn().mockResolvedValue("");
	const launcher = {
		isRunning: vi.fn().mockReturnValue(false),
		launch: vi.fn().mockResolvedValue(undefined),
	};
	const service = new ReviewPromptQueueService(
		store,
		{
			loadSnapshot: vi.fn().mockResolvedValue({
				scope: "working",
				capturedAt: "2026-07-25T12:00:00.000Z",
				revision: "revision",
				worktreeIdentity: "worktree",
				files: [file],
			}),
		} as never,
		{ resolve: () => target } as never,
		{ listProjects: () => [{ projectSlug: "project" }] } as never,
		{ execute } as never,
		launcher,
	);
	const agent = {
		name: "project--st-1-ticket",
		pane_id: "pane-1",
		agent_status: "idle",
	};
	return { store, service, execute, launcher, agent, snapshot };
}

describe("ReviewPromptQueueService", () => {
	it("delivers FIFO, removes Sent after two seconds, and waits for the three-second cooldown", async () => {
		const { store, service, execute, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);

		await service.process([agent]);
		expect(execute).toHaveBeenCalledTimes(1);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");

		await vi.advanceTimersByTimeAsync(2_000);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items
				.map((item) => item.feedback),
		).toEqual(["Second"]);
		expect(execute).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(execute).toHaveBeenCalledTimes(2);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");
	});

	it("starts a Herdr Agent with the prompt when the Ticket has none", async () => {
		const { store, service, execute, launcher, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);

		await service.process([]);
		expect(execute).not.toHaveBeenCalled();
		expect(launcher.launch).toHaveBeenCalledTimes(1);
		expect(launcher.launch.mock.calls[0][1]).toContain("First");
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");

		launcher.isRunning.mockReturnValue(true);
		await vi.advanceTimersByTimeAsync(5_000);
		await service.process([]);
		expect(launcher.launch).toHaveBeenCalledTimes(1);
	});

	it("delivers a prompt without a Review Selection verbatim", async () => {
		const { store, service, execute, agent } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "Rerun the tests");

		await service.process([agent]);
		expect(execute).toHaveBeenCalledTimes(1);
		expect(execute.mock.calls[0][2].prompt).toBe("Rerun the tests");
	});

	it("keeps a failed head stopped until Retry and normal eligibility returns", async () => {
		const { store, service, execute, agent, snapshot } = setupQueue();
		const first = store.enqueue(
			"project",
			"st-1-ticket",
			"worktree",
			"First",
			snapshot,
		);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);
		execute.mockRejectedValueOnce(new Error("pane unavailable"));

		await service.process([agent]);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("error");
		await service.process([agent]);
		expect(execute).toHaveBeenCalledTimes(1);

		store.retry("project", "st-1-ticket", "worktree", first.id);
		await service.process([{ ...agent, agent_status: "working" }]);
		expect(execute).toHaveBeenCalledTimes(1);
		await service.process([agent]);
		expect(execute).toHaveBeenCalledTimes(2);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");
	});
});
