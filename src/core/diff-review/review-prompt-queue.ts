import type { CommandTemplateExecutor } from "../command-template/command-template-types.js";
import type { HerdrAgent } from "../herdr/herdr-exec.js";
import { agentBelongsToTarget } from "../herdr/herdr-control.js";
import { appLog } from "../infra/app-logger.js";
import { errorMessage } from "../shared/errors.js";
import { reviewSelectionStillExists } from "./diff-review-model.js";
import { renderReviewPrompt } from "./review-prompt-text.js";
import type { DiffReviewGitService } from "./diff-review-git.js";
import type { DiffReviewStore } from "./diff-review-store.js";
import type { DiffReviewTargetResolver, ResolvedDiffReviewTarget } from "./diff-review-target.js";
import type { ReviewAgentLauncher } from "./review-agent-launcher.js";
import type {
	DiffReviewTicketState,
	ReviewPromptQueueItem,
	ReviewPromptSnapshot,
} from "./diff-review-types.js";

const DELIVERY_COOLDOWN_MS = 3_000;
const AGENT_STARTUP_COOLDOWN_MS = 45_000;

function ticketKey(projectSlug: string, folderName: string): string {
	return `${projectSlug}\0${folderName}`;
}

function headNotWaitingMessage(state: ReviewPromptQueueItem["state"]): string {
	if (state === "error" || state === "uncertain") {
		return "The first Review Prompt failed to deliver. Retry it, then start the Agent.";
	}
	return state === "sent"
		? "The first Review Prompt is with an Agent. Retry it to send it again."
		: "The first Review Prompt is already on its way to an Agent.";
}

function agentMatchesTarget(agent: HerdrAgent, target: ResolvedDiffReviewTarget): boolean {
	return agentBelongsToTarget(agent, {
		projectSlug: target.projectSlug,
		folderName: target.folderName,
		agentWorktreePath: target.worktreePath,
	});
}

/** An Agent that has finished what it was given and can take the next prompt. */
function agentIsFree(agent: HerdrAgent): boolean {
	return agent.agent_status === "idle" || agent.agent_status === "done";
}

type TicketAgentObservation =
	| { kind: "herdr"; agent: HerdrAgent }
	| { kind: "profile" }
	| { kind: "absent" }
	| { kind: "ambiguous" };

export class ReviewPromptQueueService {
	private readonly recoveredProjects = new Set<string>();
	private readonly processingTickets = new Set<string>();
	private readonly ticketFinished = new Map<string, Promise<void>>();
	private readonly finishTicket = new Map<string, () => void>();
	private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly agentSnapshots = new Map<
		string,
		{ agents: HerdrAgent[]; readAt: number }
	>();

	constructor(
		private readonly store: DiffReviewStore,
		private readonly git: DiffReviewGitService,
		private readonly targets: DiffReviewTargetResolver,
		private readonly commands: CommandTemplateExecutor,
		private readonly launcher: ReviewAgentLauncher,
		private readonly observeProject?: (
			projectSlug: string,
		) => Promise<{ agents: HerdrAgent[]; observedAt: number } | undefined>,
	) {}

	async reconcileProject(
		projectSlug: string,
		observation?: HerdrAgent[] | { agents: HerdrAgent[]; observedAt: number },
	): Promise<void> {
		if (!this.recoveredProjects.has(projectSlug)) {
			this.store.recoverInterrupted(projectSlug);
			this.recoveredProjects.add(projectSlug);
		}
		const observed = Array.isArray(observation)
			? { agents: observation, observedAt: Date.now() }
			: observation ?? await this.observeProject?.(projectSlug);
		if (!observed) return;
		const snapshot = { agents: observed.agents, readAt: observed.observedAt };
		this.agentSnapshots.set(projectSlug, snapshot);
		const pending: Promise<void>[] = [];
		const state = this.store.loadProject(projectSlug);
		for (const [folderName, ticketState] of Object.entries(state.tickets)) {
			if (ticketState.queue.items.length === 0) continue;
			pending.push(this.processTicketIsolated(projectSlug, folderName, snapshot));
		}
		await Promise.all(pending);
	}

	/**
	 * Whether an Agent is running for this Ticket. One answer covers every
	 * Agent the queue can talk to: a Herdr Agent from the last agent report,
	 * or a launcher-profile Agent whose marker is still alive. Everyone who
	 * decides whether to start an Agent asks here, so a running Agent never
	 * reads as no Agent and never gets launched a second time.
	 */
	isAgentRunning(projectSlug: string, folderName: string): boolean {
		const target = this.targets.resolve(projectSlug, folderName);
		const ticket = this.store.getTicket(projectSlug, folderName, target.worktreeIdentity);
		return this.agentRunningFor(target) || this.launchReserved(ticket);
	}

	private agentRunningFor(target: ResolvedDiffReviewTarget): boolean {
		return this.observeTicketAgent(
			target,
			this.agentSnapshots.get(target.projectSlug)?.agents ?? [],
		).kind !== "absent";
	}

	private observeTicketAgent(
		target: ResolvedDiffReviewTarget,
		agents: HerdrAgent[],
	): TicketAgentObservation {
		const matching = agents.filter((agent) => agentMatchesTarget(agent, target));
		if (matching.length > 1) return { kind: "ambiguous" };
		if (matching[0]) return { kind: "herdr", agent: matching[0] };
		return this.launcher.isRunning(target) ? { kind: "profile" } : { kind: "absent" };
	}

	/**
	 * Starts an Agent for one ticket right now. When the queue holds Review
	 * Prompts, the head travels as the Agent's initial prompt; an empty queue
	 * starts the Agent with none. This is the only path that starts an Agent, so
	 * an Agent appears on the user's machine only when the user asks for one.
	 */
	async launchWithQueueHead(
		projectSlug: string,
		folderName: string,
		profileName: string,
	): Promise<void> {
		await this.withTicketLock(projectSlug, folderName, async () => {
			if (!await this.refreshAgentSnapshot(projectSlug)) {
				throw new Error("Herdr is unavailable, so another Agent cannot be ruled out.");
			}
			await this.launchWithQueueHeadLocked(projectSlug, folderName, profileName);
		});
	}

	async enqueueAndLaunch(
		projectSlug: string,
		folderName: string,
		feedback: string,
		snapshot: ReviewPromptSnapshot | undefined,
		profileName?: string,
	): Promise<ReviewPromptQueueItem> {
		return this.withTicketLock(projectSlug, folderName, async () => {
			const target = this.targets.resolve(projectSlug, folderName);
			const agentsKnown = await this.refreshAgentSnapshot(projectSlug);
			const item = this.store.enqueue(
				projectSlug, folderName, target.worktreeIdentity, feedback, snapshot,
			);
			if (
				profileName
				&& (!agentsKnown || !this.agentRunningFor(target))
			) {
				await this.requestAgentLaunchLocked(target, profileName, agentsKnown);
			}
			return item;
		});
	}

	async retryAndLaunch(
		projectSlug: string,
		folderName: string,
		itemId: string,
		profileName?: string,
	): Promise<void> {
		await this.withTicketLock(projectSlug, folderName, async () => {
			const target = this.targets.resolve(projectSlug, folderName);
			const agentsKnown = await this.refreshAgentSnapshot(projectSlug);
			this.store.retry(projectSlug, folderName, target.worktreeIdentity, itemId);
			if (
				profileName
				&& (!agentsKnown || !this.agentRunningFor(target))
			) {
				await this.requestAgentLaunchLocked(target, profileName, agentsKnown);
			}
		});
	}

	private async requestAgentLaunchLocked(
		target: ResolvedDiffReviewTarget,
		profileName: string,
		agentsKnown: boolean,
	): Promise<void> {
		const current = this.store.getTicket(
			target.projectSlug, target.folderName, target.worktreeIdentity,
		);
		if (current.queue.items[0]?.state !== "waiting" || this.launchReserved(current)) return;
		const ticket = this.store.requestAgentLaunch(
			target.projectSlug, target.folderName, target.worktreeIdentity, profileName,
		);
		if (!agentsKnown) return;
		const cooldownRemaining = this.cooldownRemainingMs(ticket);
		if (cooldownRemaining > 0) {
			const key = ticketKey(target.projectSlug, target.folderName);
			this.scheduleTicket(
				`${key}:cooldown`, cooldownRemaining, target.projectSlug, target.folderName,
			);
			return;
		}
		await this.launchWithQueueHeadLocked(
			target.projectSlug, target.folderName, profileName,
		);
	}

	private async refreshAgentSnapshot(projectSlug: string): Promise<boolean> {
		if (!this.observeProject) return true;
		const observation = await this.observeProject(projectSlug);
		if (!observation) return false;
		this.agentSnapshots.set(projectSlug, {
			agents: observation.agents,
			readAt: observation.observedAt,
		});
		return true;
	}

	private async launchWithQueueHeadLocked(
		projectSlug: string,
		folderName: string,
		profileName: string,
	): Promise<void> {
		const target = this.targets.resolve(projectSlug, folderName);
		const ticket = this.store.getTicket(projectSlug, folderName, target.worktreeIdentity);
		const head = ticket.queue.items[0];
		if (head && head.state !== "waiting") throw new Error(headNotWaitingMessage(head.state));
		if (this.agentRunningFor(target)) {
			throw new Error(
				"An Agent for this Ticket is already running. Close it first, or wait"
				+ " for Herdr to report it free so the Review Prompt Queue can reach it.",
			);
		}
		if (this.launchReserved(ticket) || this.cooldownRemainingMs(ticket) > 0) {
			throw new Error(
				"An Agent for this Ticket was just started. Wait for it to come up: the"
				+ " Review Prompt Queue hands it the next Review Prompt on its own.",
			);
		}
		this.store.clearAgentLaunchRequest(
			projectSlug, folderName, target.worktreeIdentity,
		);
		if (head) {
			await this.deliver(target, head, this.agentLaunchDelivery(target, profileName));
			return;
		}
		const reservedUntil = new Date(Date.now() + AGENT_STARTUP_COOLDOWN_MS);
		this.store.reserveAgentLaunch(
			projectSlug, folderName, target.worktreeIdentity, reservedUntil,
		);
		try {
			await this.launcher.launch(target, "", profileName);
		} catch (error) {
			this.store.clearAgentLaunchReservation(projectSlug, folderName, target.worktreeIdentity);
			throw error;
		}
		this.store.completeAgentLaunch(
			projectSlug, folderName, target.worktreeIdentity, reservedUntil,
		);
	}

	private async withTicketLock<T>(
		projectSlug: string,
		folderName: string,
		run: () => Promise<T>,
	): Promise<T> {
		const processingKey = ticketKey(projectSlug, folderName);
		await this.acquireTicket(processingKey);
		try {
			return await run();
		} finally {
			this.releaseTicket(processingKey);
		}
	}

	private async acquireTicket(processingKey: string): Promise<void> {
		while (this.processingTickets.has(processingKey)) {
			await this.ticketFinished.get(processingKey);
		}
		this.processingTickets.add(processingKey);
		this.ticketFinished.set(processingKey, new Promise((resolve) => {
			this.finishTicket.set(processingKey, resolve);
		}));
	}

	private releaseTicket(processingKey: string): void {
		this.processingTickets.delete(processingKey);
		this.finishTicket.get(processingKey)?.();
		this.finishTicket.delete(processingKey);
		this.ticketFinished.delete(processingKey);
	}

	/**
	 * Starting an Agent is a delivery like any other: the prompt travels as the
	 * Agent's first input, and the queue waits out the Agent's startup before it
	 * considers delivering the next one.
	 */
	private agentLaunchDelivery(
		target: ResolvedDiffReviewTarget,
		profileName: string,
	) {
		return {
			send: (prompt: string) => this.launcher.launch(target, prompt, profileName),
			cooldownMs: AGENT_STARTUP_COOLDOWN_MS,
		};
	}

	private async processTicket(
		projectSlug: string,
		folderName: string,
		agents: HerdrAgent[],
		agentsReadAt: number,
	): Promise<void> {
		const processingKey = ticketKey(projectSlug, folderName);
		if (this.processingTickets.has(processingKey)) return;
		await this.acquireTicket(processingKey);
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
			if (head.state !== "waiting" && head.state !== "sent") return;
			const agent = this.observeTicketAgent(target, agents);
			// A delivered Review Prompt stays at the head of the queue for as long as
			// the Agent works on it, so the queue shows what the Agent is running and
			// hands over the next Review Prompt only once the Agent is free again. Only
			// an Agent report read after the delivery can say that: an older one still
			// describes the Agent as it was before it received the prompt.
			if (head.state === "sent") {
				const sentAt = Date.parse(head.sentAt);
				if (!Number.isFinite(sentAt)) {
					throw new Error("A delivered Review Prompt carries no delivery time.");
				}
				if (agentsReadAt <= sentAt) return;
				if (agent.kind === "absent") {
					this.store.failSentDelivery(
						projectSlug,
						folderName,
						target.worktreeIdentity,
						head.id,
						"The Agent that received this Review Prompt is no longer running."
							+ " Retry it if the work was not completed.",
					);
					return;
				}
				if (agent.kind !== "herdr" || !agentIsFree(agent.agent)) return;
				this.store.acknowledgeSent(
					projectSlug,
					folderName,
					target.worktreeIdentity,
					head.id,
				);
				this.scheduleTicket(`${processingKey}:advance`, 0, projectSlug, folderName);
				return;
			}
			const cooldownRemaining = this.cooldownRemainingMs(ticket);
			if (cooldownRemaining > 0) {
				this.scheduleTicket(
					`${processingKey}:cooldown`, cooldownRemaining, projectSlug, folderName,
				);
				return;
			}
			if (agent.kind === "absent" && ticket.queue.requestedAgentProfileName) {
				const profileName = ticket.queue.requestedAgentProfileName;
				await this.launchWithQueueHeadLocked(projectSlug, folderName, profileName);
				return;
			}
			if (agent.kind !== "absent" && ticket.queue.requestedAgentProfileName) {
				this.store.clearAgentLaunchRequest(
					projectSlug, folderName, target.worktreeIdentity,
				);
			}
			// Starting an Agent opens a terminal on the user's machine, so only the
			// user starts one. With no Herdr Agent to deliver to, the Review Prompt
			// keeps its place and waits for one.
			if (agent.kind !== "herdr") return;
			if (!agent.agent.pane_id) return;
			if (!agentIsFree(agent.agent)) return;
			const paneId = agent.agent.pane_id;
			await this.deliver(target, head, {
				send: (prompt) => this.commands.execute(
					"herdr.review-prompt.deliver",
					target.worktreePath,
					{ paneId, prompt },
				).then(() => undefined),
				cooldownMs: DELIVERY_COOLDOWN_MS,
			});
		} finally {
			this.releaseTicket(processingKey);
		}
	}

	private async processTicketIsolated(
		projectSlug: string,
		folderName: string,
		snapshot: { agents: HerdrAgent[]; readAt: number },
	): Promise<void> {
		try {
			await this.processTicket(projectSlug, folderName, snapshot.agents, snapshot.readAt);
		} catch (error) {
			appLog("diff-review", `queue processing failed: ${errorMessage(error)}`, {
				projectSlug,
				ticketFolderName: folderName,
			});
		}
	}

	/**
	 * How long the queue still owes this Ticket after its last delivery. Every
	 * delivery path waits it out, so a manual start cannot double up on the Agent
	 * the queue has already started.
	 */
	private cooldownRemainingMs(ticket: DiffReviewTicketState): number {
		const cooldown = Date.parse(ticket.queue.cooldownUntil ?? "");
		if (!Number.isFinite(cooldown)) return 0;
		return Math.max(0, cooldown - Date.now());
	}

	private launchReserved(ticket: DiffReviewTicketState): boolean {
		const reservedUntil = Date.parse(ticket.queue.agentLaunchReservedUntil ?? "");
		return Number.isFinite(reservedUntil) && reservedUntil > Date.now();
	}

	private async deliver(
		target: ResolvedDiffReviewTarget,
		item: ReviewPromptQueueItem,
		delivery: { send(prompt: string): Promise<void>; cooldownMs: number },
	): Promise<void> {
		this.store.beginDelivery(
			target.projectSlug,
			target.folderName,
			target.worktreeIdentity,
			item.id,
		);
		try {
			const freshness = item.snapshot
				? await this.checkFreshness(target, item.snapshot)
				: { stale: false };
			await delivery.send(renderReviewPrompt(item, freshness));
		} catch (error) {
			this.store.failDelivery(
				target.projectSlug,
				target.folderName,
				target.worktreeIdentity,
				item.id,
				errorMessage(error),
			);
			return;
		}
		const sentAt = new Date();
		try {
			this.store.completeDelivery(
				target.projectSlug,
				target.folderName,
				target.worktreeIdentity,
				item.id,
				sentAt,
				delivery.cooldownMs,
			);
		} catch (error) {
			this.store.markDeliveryUncertain(
				target.projectSlug,
				target.folderName,
				target.worktreeIdentity,
				item.id,
				`The Agent accepted this Review Prompt, but its queue state could not be saved: ${errorMessage(error)}`,
			);
			return;
		}
		const key = ticketKey(target.projectSlug, target.folderName);
		this.scheduleTicket(
			`${key}:cooldown`, delivery.cooldownMs, target.projectSlug, target.folderName,
		);
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

	private schedule(key: string, delayMs: number, task: () => Promise<void>): void {
		const existing = this.timers.get(key);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			this.timers.delete(key);
			void task().catch((cause: unknown) => {
				appLog("diff-review", `scheduled queue processing failed: ${errorMessage(cause)}`);
			});
		}, Math.max(0, delayMs));
		this.timers.set(key, timer);
	}

	private scheduleTicket(
		key: string,
		delayMs: number,
		projectSlug: string,
		folderName: string,
	): void {
		this.schedule(key, delayMs, async () => {
			if (this.observeProject) {
				await this.reconcileProject(projectSlug);
				return;
			}
			const snapshot = this.agentSnapshots.get(projectSlug);
			if (!snapshot) return;
			await this.processTicketIsolated(projectSlug, folderName, snapshot);
		});
	}
}
