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
		{ execute } as never,
		launcher,
	);
	const agent = {
		name: "project--st-1-ticket",
		pane_id: "pane-1",
		agent_status: "idle",
	};
	return { store, service, execute, launcher, agent, snapshot, target };
}

describe("ReviewPromptQueueService", () => {
	it("keeps the delivered head until the Agent is free, then delivers the next one", async () => {
		const { store, service, execute, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);

		await service.reconcileProject("project", [agent]);
		expect(execute).toHaveBeenCalledTimes(1);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");

		await vi.advanceTimersByTimeAsync(3_000);
		await service.reconcileProject("project", [{ ...agent, agent_status: "working" }]);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items
				.map((item) => item.feedback),
		).toEqual(["First", "Second"]);
		expect(execute).toHaveBeenCalledTimes(1);

		await service.reconcileProject("project", [agent]);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items
				.map((item) => item.feedback),
		).toEqual(["Second"]);

		await vi.advanceTimersByTimeAsync(0);
		expect(execute).toHaveBeenCalledTimes(2);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");
	});

	it("keeps the delivered head on an Agent report older than the delivery", async () => {
		const { store, service, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);

		await service.reconcileProject("project", [agent]);
		await service.reconcileProject("project", [agent]);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items,
		).toHaveLength(1);

		await vi.advanceTimersByTimeAsync(1_000);
		await service.reconcileProject("project", [agent]);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items,
		).toEqual([]);
	});

	it("makes a delivered head retryable when a fresh report says its Agent disappeared", async () => {
		const { store, service, execute, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);

		await service.reconcileProject("project", [agent]);
		await vi.advanceTimersByTimeAsync(1_000);
		await service.reconcileProject("project", []);

		const items = store.getTicket("project", "st-1-ticket", "worktree").queue.items;
		expect(items.map((item) => item.feedback)).toEqual(["First", "Second"]);
		expect(items[0].state).toBe("error");
		if (items[0].state !== "error") throw new Error("Expected a retryable delivery error.");
		expect(items[0].error).toMatch(/Agent.*no longer running/);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("keeps a delivered head while its profile Agent marker is alive", async () => {
		const { store, service, launcher, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		await service.reconcileProject("project", [agent]);
		launcher.isRunning.mockReturnValue(true);
		await vi.advanceTimersByTimeAsync(1_000);

		await service.reconcileProject("project", []);

		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");
	});

	it("does not acknowledge from an observation that started before delivery", async () => {
		const { store, service, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		await service.reconcileProject("project", [agent]);
		await vi.advanceTimersByTimeAsync(1_000);

		await service.reconcileProject("project", {
			agents: [agent],
			observedAt: Date.parse("2026-07-25T12:00:00.000Z"),
		});

		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items,
		).toHaveLength(1);
	});

	it("preserves a delivered head across service restart until Agent state is observed", async () => {
		const { store, service, execute, agent, snapshot, target } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);
		await service.reconcileProject("project", [agent]);

		const restartedService = new ReviewPromptQueueService(
			store,
			{ loadSnapshot: vi.fn() } as never,
			{ resolve: () => target } as never,
			{ execute: vi.fn() } as never,
			{ isRunning: vi.fn().mockReturnValue(false), launch: vi.fn() } as never,
		);

		await restartedService.reconcileProject("project", [{ ...agent, agent_status: "working" }]);

		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items
				.map((item) => item.feedback),
		).toEqual(["First", "Second"]);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("recovers an interrupted delivery when Herdr is unavailable after restart", async () => {
		const { store, snapshot, target } = setupQueue();
		const item = store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.beginDelivery("project", "st-1-ticket", "worktree", item.id);
		const restartedService = new ReviewPromptQueueService(
			store,
			{ loadSnapshot: vi.fn() } as never,
			{ resolve: () => target } as never,
			{ execute: vi.fn() } as never,
			{ isRunning: vi.fn().mockReturnValue(false), launch: vi.fn() } as never,
			vi.fn().mockResolvedValue(undefined),
		);

		await restartedService.reconcileProject("project");

		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("uncertain");
	});

	it("delivers a retried head again", async () => {
		const { store, service, execute, agent, snapshot } = setupQueue();
		const first = store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);

		await service.reconcileProject("project", [agent]);
		expect(execute).toHaveBeenCalledTimes(1);

		store.retry("project", "st-1-ticket", "worktree", first.id);
		await vi.advanceTimersByTimeAsync(3_000);
		await service.reconcileProject("project", [agent]);
		expect(execute).toHaveBeenCalledTimes(2);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");
	});

	it("never starts a Herdr Agent on its own when the Ticket has none", async () => {
		const { store, service, execute, launcher, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);

		await service.reconcileProject("project", []);
		await vi.advanceTimersByTimeAsync(60_000);
		await service.reconcileProject("project", []);

		expect(execute).not.toHaveBeenCalled();
		expect(launcher.launch).not.toHaveBeenCalled();
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("waiting");
	});

	it("refuses to start an Agent while one is already running for the Ticket", async () => {
		const { store, service, launcher, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		launcher.isRunning.mockReturnValue(true);

		await expect(service.launchWithQueueHead("project", "st-1-ticket", "GPT"))
			.rejects.toThrow(/already running/);
		expect(launcher.launch).not.toHaveBeenCalled();
	});

	it("refuses to start an Agent when the Ticket's Herdr Agent is already running", async () => {
		const { store, service, launcher, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		// The queue already talks to the Ticket's Herdr Agent. A Herdr Agent
		// leaves no launcher marker, so the marker check alone misses it and a
		// launch would stop and restart that Agent.
		await service.reconcileProject("project", [{ ...agent, agent_status: "working" }]);
		expect(launcher.isRunning).toHaveBeenCalledTimes(0);

		await expect(service.launchWithQueueHead("project", "st-1-ticket", "GPT"))
			.rejects.toThrow(/already running/);
		expect(launcher.launch).not.toHaveBeenCalled();
	});

	it("starts an Agent on request with the queue head as the initial prompt", async () => {
		const { store, service, launcher, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);

		await service.launchWithQueueHead("project", "st-1-ticket", "GPT");
		expect(launcher.launch).toHaveBeenCalledTimes(1);
		expect(launcher.launch.mock.calls[0][1]).toContain("First");
		expect(launcher.launch.mock.calls[0][2]).toBe("GPT");
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");
	});

	it("starts an Agent on request with no prompt when the queue is empty", async () => {
		const { store, service, launcher } = setupQueue();

		await service.launchWithQueueHead("project", "st-1-ticket", "GPT");
		expect(launcher.launch).toHaveBeenCalledTimes(1);
		expect(launcher.launch.mock.calls[0][1]).toBe("");
		expect(launcher.launch.mock.calls[0][2]).toBe("GPT");
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.cooldownUntil,
		).toBe("2026-07-25T12:00:45.000Z");
	});

	it("persists an empty launch reservation before starting the Agent", async () => {
		const { store, service, launcher } = setupQueue();
		launcher.launch.mockImplementation(async () => {
			expect(
				store.getTicket("project", "st-1-ticket", "worktree")
					.queue.agentLaunchReservedUntil,
			).toBe("2026-07-25T12:00:45.000Z");
		});

		await service.launchWithQueueHead("project", "st-1-ticket", "GPT");
	});

	it("keeps a second service from repeating a recent empty launch", async () => {
		const { store, service, launcher, target } = setupQueue();
		await service.launchWithQueueHead("project", "st-1-ticket", "GPT");
		const restartedService = new ReviewPromptQueueService(
			store,
			{ loadSnapshot: vi.fn() } as never,
			{ resolve: () => target } as never,
			{ execute: vi.fn() } as never,
			{ isRunning: vi.fn().mockReturnValue(false), launch: vi.fn() } as never,
		);

		await expect(restartedService.launchWithQueueHead("project", "st-1-ticket", "GPT"))
			.rejects.toThrow(/just started/);
		expect(launcher.launch).toHaveBeenCalledTimes(1);
	});

	it("keeps Agent observations isolated by project", async () => {
		const { service, agent } = setupQueue();
		await service.reconcileProject("project", [agent]);
		await service.reconcileProject("other-project", []);

		expect(service.isAgentRunning("project", "st-1-ticket")).toBe(true);
	});

	it("enqueues and starts an Agent as one serialized operation", async () => {
		const { store, service, launcher, snapshot } = setupQueue();

		const item = await service.enqueueAndLaunch(
			"project", "st-1-ticket", "First", snapshot, "GPT",
		);

		expect(launcher.launch).toHaveBeenCalledTimes(1);
		expect(launcher.launch.mock.calls[0][1]).toContain("First");
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].id,
		).toBe(item.id);
	});

	it("serializes a user enqueue behind delivery reconciliation", async () => {
		const { store, service, execute, agent, snapshot } = setupQueue();
		let finishDelivery!: () => void;
		execute.mockImplementationOnce(() => new Promise<string>((resolve) => {
			finishDelivery = () => resolve("");
		}));
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		const reconciling = service.reconcileProject("project", [agent]);
		await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));

		const enqueueing = service.enqueueAndLaunch(
			"project", "st-1-ticket", "Second", snapshot,
		);
		finishDelivery();
		await Promise.all([reconciling, enqueueing]);

		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items
				.map((item) => item.feedback),
		).toEqual(["First", "Second"]);
	});

	it("enqueues without launching when the project snapshot has the Ticket Agent", async () => {
		const { service, launcher, agent, snapshot } = setupQueue();
		await service.reconcileProject("project", [{ ...agent, agent_status: "working" }]);

		await service.enqueueAndLaunch("project", "st-1-ticket", "First", snapshot, "GPT");

		expect(launcher.launch).not.toHaveBeenCalled();
	});

	it("enqueues without launching when no Agent profile is configured", async () => {
		const { store, service, launcher, snapshot } = setupQueue();

		await service.enqueueAndLaunch(
			"project", "st-1-ticket", "First", snapshot, undefined,
		);

		expect(launcher.launch).not.toHaveBeenCalled();
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items
				.map((item) => item.feedback),
		).toEqual(["First"]);
	});

	it("refreshes the Agent observation before deciding to launch", async () => {
		const { store, launcher, agent, snapshot, target } = setupQueue();
		const observeProject = vi.fn().mockResolvedValue({
			agents: [{ ...agent, agent_status: "working" }],
			observedAt: Date.now(),
		});
		const service = new ReviewPromptQueueService(
			store,
			{ loadSnapshot: vi.fn() } as never,
			{ resolve: () => target } as never,
			{ execute: vi.fn() } as never,
			launcher,
			observeProject,
		);

		await service.enqueueAndLaunch(
			"project", "st-1-ticket", "First", snapshot, "GPT",
		);

		expect(observeProject).toHaveBeenCalledWith("project");
		expect(launcher.launch).not.toHaveBeenCalled();
	});

	it("queues but does not launch when Herdr availability is unknown", async () => {
		const { store, launcher, snapshot, target } = setupQueue();
		const service = new ReviewPromptQueueService(
			store,
			{ loadSnapshot: vi.fn() } as never,
			{ resolve: () => target } as never,
			{ execute: vi.fn() } as never,
			launcher,
			vi.fn().mockResolvedValue(undefined),
		);

		await service.enqueueAndLaunch(
			"project", "st-1-ticket", "First", snapshot, "GPT",
		);

		expect(launcher.launch).not.toHaveBeenCalled();
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items,
		).toHaveLength(1);
	});

	it("points at Retry when the head Review Prompt failed to deliver", async () => {
		const { store, service, execute, agent, snapshot } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		execute.mockRejectedValueOnce(new Error("pane unavailable"));
		await service.reconcileProject("project", [agent]);

		await expect(service.launchWithQueueHead("project", "st-1-ticket", "GPT"))
			.rejects.toThrow(/Retry/);
	});

	it("refuses to start a second Agent while the one it just started is booting", async () => {
		const { store, service, launcher, snapshot } = setupQueue();
		const first = store.enqueue("project", "st-1-ticket", "worktree", "First", snapshot);
		store.enqueue("project", "st-1-ticket", "worktree", "Second", snapshot);

		await service.launchWithQueueHead("project", "st-1-ticket", "GPT");
		expect(launcher.launch).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(2_000);

		await expect(service.launchWithQueueHead("project", "st-1-ticket", "GPT"))
			.rejects.toThrow(/is with an Agent/);

		store.retry("project", "st-1-ticket", "worktree", first.id);
		await expect(service.launchWithQueueHead("project", "st-1-ticket", "GPT"))
			.rejects.toThrow(/was just started/);
		expect(launcher.launch).toHaveBeenCalledTimes(1);
	});

	it("delivers a prompt without a Review Selection verbatim", async () => {
		const { store, service, execute, agent } = setupQueue();
		store.enqueue("project", "st-1-ticket", "worktree", "Rerun the tests");

		await service.reconcileProject("project", [agent]);
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

		await service.reconcileProject("project", [agent]);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("error");
		await service.reconcileProject("project", [agent]);
		expect(execute).toHaveBeenCalledTimes(1);

		store.retry("project", "st-1-ticket", "worktree", first.id);
		await service.reconcileProject("project", [{ ...agent, agent_status: "working" }]);
		expect(execute).toHaveBeenCalledTimes(1);
		await service.reconcileProject("project", [agent]);
		expect(execute).toHaveBeenCalledTimes(2);
		expect(
			store.getTicket("project", "st-1-ticket", "worktree").queue.items[0].state,
		).toBe("sent");
	});
});
