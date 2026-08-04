import type { CommandTemplateExecutor } from "../command-template/command-template-types.js";
import type { HerdrAgent } from "../herdr/herdr-exec.js";
import { agentBelongsToTarget } from "../herdr/herdr-control.js";
import type { ProjectRegistry } from "../project/project-registry.js";
import { appLog } from "../infra/app-logger.js";
import { errorMessage } from "../shared/errors.js";
import { reviewSelectionStillExists } from "./diff-review-model.js";
import { renderReviewPrompt } from "./review-prompt-text.js";
import type { DiffReviewGitService } from "./diff-review-git.js";
import type { DiffReviewStore } from "./diff-review-store.js";
import type { DiffReviewTargetResolver, ResolvedDiffReviewTarget } from "./diff-review-target.js";
import type { ReviewAgentLauncher } from "./review-agent-launcher.js";
import type {
	ReviewPromptQueueItem,
	ReviewPromptSnapshot,
} from "./diff-review-types.js";

const SENT_PRESENTATION_MS = 2_000;
const DELIVERY_COOLDOWN_MS = 3_000;
const AGENT_STARTUP_COOLDOWN_MS = 45_000;

function agentMatchesTarget(agent: HerdrAgent, target: ResolvedDiffReviewTarget): boolean {
	return agentBelongsToTarget(agent, {
		projectSlug: target.projectSlug,
		folderName: target.folderName,
		agentWorktreePath: target.worktreePath,
	});
}

export class ReviewPromptQueueService {
	private readonly recoveredProjects = new Set<string>();
	private readonly processingTickets = new Set<string>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private latestAgents: HerdrAgent[] = [];

	constructor(
		private readonly store: DiffReviewStore,
		private readonly git: DiffReviewGitService,
		private readonly targets: DiffReviewTargetResolver,
		private readonly projectRegistry: ProjectRegistry,
		private readonly commands: CommandTemplateExecutor,
		private readonly launcher: ReviewAgentLauncher,
	) {}

	async process(agents: HerdrAgent[]): Promise<void> {
		this.latestAgents = agents;
		const pending: Promise<void>[] = [];
		for (const project of this.projectRegistry.listProjects()) {
			if (!this.recoveredProjects.has(project.projectSlug)) {
				this.store.recoverInterrupted(project.projectSlug);
				this.recoveredProjects.add(project.projectSlug);
			}
			const state = this.store.loadProject(project.projectSlug);
			for (const [folderName, ticketState] of Object.entries(state.tickets)) {
				if (ticketState.queue.items.length === 0) continue;
				pending.push(this.processTicket(project.projectSlug, folderName, agents));
			}
		}
		await Promise.all(pending);
	}

	private async processTicket(
		projectSlug: string,
		folderName: string,
		agents: HerdrAgent[],
	): Promise<void> {
		const processingKey = `${projectSlug}\0${folderName}`;
		if (this.processingTickets.has(processingKey)) return;
		this.processingTickets.add(processingKey);
		try {
			let target: ResolvedDiffReviewTarget;
			try {
				target = this.targets.resolve(projectSlug, folderName);
			} catch (error) {
				appLog("diff-review", `queue target unavailable: ${errorMessage(error)}`, {
					projectSlug,
					ticketFolderName: folderName,
				});
				return;
			}
			const ticket = this.store.getTicket(
				projectSlug,
				folderName,
				target.worktreeIdentity,
			);
			const head = ticket.queue.items[0];
			if (!head) return;
			if (head.state === "sent") {
				const sentAt = Date.parse(head.sentAt ?? "");
				if (!Number.isFinite(sentAt) || Date.now() - sentAt >= SENT_PRESENTATION_MS) {
					this.removeSentHead(projectSlug, folderName, target.worktreeIdentity, head.id);
					this.schedule(`${processingKey}:advance`, 0, () => {
						void this.processTicket(projectSlug, folderName, this.latestAgents);
					});
				}
				return;
			}
			if (head.state !== "waiting") return;
			const cooldown = Date.parse(ticket.queue.cooldownUntil ?? "");
			if (Number.isFinite(cooldown) && cooldown > Date.now()) {
				this.schedule(`${processingKey}:cooldown`, cooldown - Date.now(), () => {
					void this.processTicket(projectSlug, folderName, this.latestAgents);
				});
				return;
			}
			const matching = agents.filter((agent) => agentMatchesTarget(agent, target));
			if (matching.length > 1) return;
			if (matching.length === 0) {
				if (this.launcher.isRunning(target)) return;
				await this.deliver(target, head, {
					send: (prompt) => this.launcher.launch(target, prompt),
					cooldownMs: AGENT_STARTUP_COOLDOWN_MS,
				});
				return;
			}
			const agent = matching[0];
			if (!agent.pane_id) return;
			if (agent.agent_status !== "idle" && agent.agent_status !== "done") return;
			const paneId = agent.pane_id;
			await this.deliver(target, head, {
				send: (prompt) => this.commands.execute(
					"herdr.review-prompt.deliver",
					target.worktreePath,
					{ paneId, prompt },
				).then(() => undefined),
				cooldownMs: DELIVERY_COOLDOWN_MS,
			});
		} finally {
			this.processingTickets.delete(processingKey);
		}
	}

	private async deliver(
		target: ResolvedDiffReviewTarget,
		item: ReviewPromptQueueItem,
		delivery: { send(prompt: string): Promise<void>; cooldownMs: number },
	): Promise<void> {
		this.store.updateQueue(
			target.projectSlug,
			target.folderName,
			target.worktreeIdentity,
			(ticket) => {
				const head = ticket.queue.items[0];
				if (!head || head.id !== item.id || head.state !== "waiting") {
					throw new Error("Review Prompt queue head changed before delivery.");
				}
				head.state = "delivering";
				head.deliveryStartedAt = new Date().toISOString();
			},
		);
		try {
			const freshness = item.snapshot
				? await this.checkFreshness(target, item.snapshot)
				: { stale: false };
			await delivery.send(renderReviewPrompt(item, freshness));
			const sentAt = new Date();
			this.store.updateQueue(
				target.projectSlug,
				target.folderName,
				target.worktreeIdentity,
				(ticket) => {
					const head = ticket.queue.items[0];
					if (!head || head.id !== item.id) {
						throw new Error("Review Prompt queue head changed during delivery.");
					}
					head.state = "sent";
					head.sentAt = sentAt.toISOString();
					delete head.deliveryStartedAt;
					delete head.error;
					ticket.queue.cooldownUntil =
						new Date(sentAt.getTime() + delivery.cooldownMs).toISOString();
				},
			);
			const key = `${target.projectSlug}\0${target.folderName}`;
			this.schedule(`${key}:sent`, SENT_PRESENTATION_MS, () => {
				this.removeSentHead(
					target.projectSlug,
					target.folderName,
					target.worktreeIdentity,
					item.id,
				);
			});
			this.schedule(`${key}:cooldown`, delivery.cooldownMs, () => {
				void this.processTicket(target.projectSlug, target.folderName, this.latestAgents);
			});
		} catch (error) {
			this.store.updateQueue(
				target.projectSlug,
				target.folderName,
				target.worktreeIdentity,
				(ticket) => {
					const head = ticket.queue.items[0];
					if (!head || head.id !== item.id) {
						throw new Error("Review Prompt queue head changed during failed delivery.");
					}
					head.state = "error";
					head.error = errorMessage(error);
					delete head.deliveryStartedAt;
				},
			);
		}
	}

	private async checkFreshness(
		target: ResolvedDiffReviewTarget,
		snapshot: ReviewPromptSnapshot,
	): Promise<{ stale: boolean; verificationError?: string }> {
		try {
			const current = await this.git.loadSnapshot(target, snapshot.scope);
			const file = current.files.find((candidate) => candidate.path === snapshot.filePath);
			return { stale: !reviewSelectionStillExists(file, snapshot) };
		} catch (error) {
			return {
				stale: false,
				verificationError: errorMessage(error),
			};
		}
	}

	private removeSentHead(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
	): void {
		this.store.updateQueue(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (head?.id === itemId && head.state === "sent") ticket.queue.items.shift();
		});
	}

	private schedule(key: string, delayMs: number, task: () => void): void {
		const existing = this.timers.get(key);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			this.timers.delete(key);
			task();
		}, Math.max(0, delayMs));
		this.timers.set(key, timer);
	}
}
