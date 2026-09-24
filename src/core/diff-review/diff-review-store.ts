import { randomUUID } from "node:crypto";
import * as v from "valibot";
import type { ConfigPaths } from "../config/config-paths.js";
import type { ConfigRepository } from "../config/config-repository.js";
import { requireSafeSlug } from "../config/config-paths.js";
import { UpdateLock } from "~/util/update-lock.js";
import { getReviewTicketState } from "./diff-review-types.js";
import type {
	DiffReviewProjectState,
	DiffReviewTicketState,
	ReviewPromptQueueItem,
	ReviewPromptSnapshot,
} from "./diff-review-types.js";

const PromptLineSchema = v.object({
	type: v.picklist(["context", "addition", "deletion"]),
	text: v.string(),
	oldLineNumber: v.optional(v.number()),
	newLineNumber: v.optional(v.number()),
});
const RangeSchema = v.object({ start: v.number(), end: v.number() });
const PromptSnapshotSchema = v.object({
	scope: v.picklist(["all", "branch", "working", "last-commit"]),
	filePath: v.string(),
	oldRange: v.optional(RangeSchema),
	newRange: v.optional(RangeSchema),
	selectedLines: v.array(PromptLineSchema),
	contextBefore: v.array(PromptLineSchema),
	contextAfter: v.array(PromptLineSchema),
	selectionFingerprint: v.string(),
	sourceRevision: v.string(),
});
const QueueItemBaseSchema = {
	id: v.string(),
	createdAt: v.string(),
	feedback: v.string(),
	snapshot: v.optional(PromptSnapshotSchema),
};
const QueueItemSchema = v.union([
	v.object({ ...QueueItemBaseSchema, state: v.literal("waiting") }),
	v.object({
		...QueueItemBaseSchema,
		state: v.literal("delivering"),
		deliveryStartedAt: v.string(),
	}),
	v.object({ ...QueueItemBaseSchema, state: v.literal("sent"), sentAt: v.string() }),
	v.object({ ...QueueItemBaseSchema, state: v.literal("error"), error: v.string() }),
	v.object({ ...QueueItemBaseSchema, state: v.literal("uncertain"), error: v.string() }),
]);
const QueueSchema = v.object({
	items: v.array(QueueItemSchema),
	cooldownUntil: v.optional(v.string()),
	agentLaunchReservedUntil: v.optional(v.string()),
	requestedAgentProfileName: v.optional(v.string()),
});
const TicketStateSchema = v.object({
	worktreeIdentity: v.string(),
	reviewedLines: v.record(
		v.string(),
		v.object({ path: v.string(), reviewedAt: v.string() }),
	),
	queue: QueueSchema,
});
const ProjectStateSchema = v.object({
	version: v.literal(2),
	tickets: v.record(v.string(), TicketStateSchema),
});
const LegacyProjectStateSchema = v.object({
	version: v.literal(1),
	tickets: v.record(
		v.string(),
		v.object({ worktreeIdentity: v.string(), queue: QueueSchema }),
	),
});

export class DiffReviewStore {
	private readonly locks = new Map<string, UpdateLock>();

	private lock(projectSlug: string): UpdateLock {
		requireSafeSlug(projectSlug);
		let lock = this.locks.get(projectSlug);
		if (!lock) this.locks.set(projectSlug, lock = new UpdateLock());
		return lock;
	}

	whenWritable<T>(projectSlug: string, write: () => T): Promise<T> {
		return this.lock(projectSlug).writeWhenAvailable(write);
	}

	release(projectSlug: string, owner: string): void {
		this.lock(projectSlug).release(owner);
	}
	constructor(
		private readonly paths: ConfigPaths,
		private readonly repository: ConfigRepository,
	) {}

	loadProject(projectSlug: string, owner?: string): DiffReviewProjectState {
		return this.lock(projectSlug).read(() => this.readProject(projectSlug), owner);
	}

	updateProject(
		projectSlug: string,
		transform: (current: DiffReviewProjectState) => DiffReviewProjectState,
		owner?: string,
	): DiffReviewProjectState {
		return this.lock(projectSlug).write(() => {
			const next = v.parse(ProjectStateSchema, transform(this.readProject(projectSlug)));
			this.repository.writeJson(this.paths.diffReviewStateFile(projectSlug), next);
			return next;
		}, owner);
	}

	private readProject(projectSlug: string): DiffReviewProjectState {
		requireSafeSlug(projectSlug);
		const filePath = this.paths.diffReviewStateFile(projectSlug);
		const raw = this.repository.readJson(filePath);
		if (raw === null) return { version: 2, tickets: {} };
		const parsed = v.safeParse(ProjectStateSchema, raw);
		if (parsed.success) return parsed.output;
		const legacy = v.safeParse(LegacyProjectStateSchema, raw);
		if (!legacy.success) {
			throw new Error(`Invalid Diff Review state in ${filePath}.`);
		}
		return {
			version: 2,
			tickets: Object.fromEntries(Object.entries(legacy.output.tickets).map(
				([folderName, ticket]) => [folderName, { ...ticket, reviewedLines: {} }],
			)),
		};
	}

	getTicket(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		owner?: string,
	): DiffReviewTicketState {
		requireSafeSlug(folderName);
		return getReviewTicketState(this.loadProject(projectSlug, owner), folderName, worktreeIdentity);
	}

	enqueue(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		feedback: string,
		snapshot?: ReviewPromptSnapshot,
	): ReviewPromptQueueItem {
		const normalizedFeedback = feedback.trim();
		if (!normalizedFeedback) throw new Error("Review Prompt feedback cannot be empty.");
		if (snapshot && snapshot.selectedLines.length === 0) {
			throw new Error("A Review Prompt with a Review Selection must contain lines.");
		}
		const created: ReviewPromptQueueItem = {
			id: randomUUID(),
			createdAt: new Date().toISOString(),
			feedback: normalizedFeedback,
			snapshot,
			state: "waiting",
		};
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, ticket => ({
			...ticket, queue: { ...ticket.queue, items: [...ticket.queue.items, created] },
		})).queue.items.at(-1)!;
	}

	retry(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (
				!head
				|| head.id !== itemId
				|| (head.state !== "error" && head.state !== "sent" && head.state !== "uncertain")
			) {
				throw new Error("Only a failed, uncertain, or delivered head Review Prompt can be retried.");
			}
			ticket.queue.items[0] = this.withState(head, { state: "waiting" });
			return ticket;
		});
	}

	beginDelivery(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (!head || head.id !== itemId || head.state !== "waiting") {
				throw new Error("Review Prompt queue head changed before delivery.");
			}
			ticket.queue.items[0] = this.withState(head, {
				state: "delivering",
				deliveryStartedAt: new Date().toISOString(),
			});
			delete ticket.queue.requestedAgentProfileName;
			return ticket;
		});
	}

	completeDelivery(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
		sentAt: Date,
		cooldownMs: number,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (!head || head.id !== itemId || head.state !== "delivering") {
				throw new Error("Review Prompt queue head changed during delivery.");
			}
			ticket.queue.items[0] = this.withState(head, {
				state: "sent",
				sentAt: sentAt.toISOString(),
			});
			ticket.queue.cooldownUntil = new Date(sentAt.getTime() + cooldownMs).toISOString();
			return ticket;
		});
	}

	failDelivery(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
		error: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (!head || head.id !== itemId || head.state !== "delivering") {
				throw new Error("Review Prompt queue head changed during failed delivery.");
			}
			ticket.queue.items[0] = this.withState(head, { state: "error", error });
			return ticket;
		});
	}

	failSentDelivery(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
		error: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (!head || head.id !== itemId || head.state !== "sent") {
				throw new Error("Only a delivered head Review Prompt can lose its Agent.");
			}
			ticket.queue.items[0] = this.withState(head, { state: "error", error });
			return ticket;
		});
	}

	markDeliveryUncertain(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
		error: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (!head || head.id !== itemId || head.state !== "delivering") {
				throw new Error("Only a delivering head Review Prompt can have an uncertain outcome.");
			}
			ticket.queue.items[0] = this.withState(head, { state: "uncertain", error });
			return ticket;
		});
	}

	acknowledgeSent(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const head = ticket.queue.items[0];
			if (!head || head.id !== itemId || head.state !== "sent") {
				throw new Error("Only a delivered head Review Prompt can be acknowledged.");
			}
			ticket.queue.items.shift();
			return ticket;
		});
	}

	reserveAgentLaunch(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		reservedUntil: Date,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const existing = Date.parse(ticket.queue.agentLaunchReservedUntil ?? "");
			if (Number.isFinite(existing) && existing > Date.now()) {
				throw new Error("An Agent launch is already in progress for this Ticket.");
			}
			ticket.queue.agentLaunchReservedUntil = reservedUntil.toISOString();
			delete ticket.queue.requestedAgentProfileName;
			return ticket;
		});
	}

	recoverInterrupted(projectSlug: string): void {
		this.lock(projectSlug).write(() => {
			const project = this.loadProject(projectSlug);
			let changed = false;
			for (const ticket of Object.values(project.tickets)) {
				for (let index = 0; index < ticket.queue.items.length; index += 1) {
					const item = ticket.queue.items[index];
					if (item.state !== "delivering") continue;
					ticket.queue.items[index] = this.withState(item, {
						state: "uncertain",
						error: "Delivery was interrupted and may have reached the Agent. Retry only if needed.",
					});
					changed = true;
				}
			}
			if (changed) this.repository.writeJson(this.paths.diffReviewStateFile(projectSlug), project);
		});
	}

	async removeTicket(projectSlug: string, folderName: string): Promise<void> {
		requireSafeSlug(folderName);
		await this.lock(projectSlug).writeWhenAvailable(() => {
			const project = this.loadProject(projectSlug);
			if (!Object.hasOwn(project.tickets, folderName)) return;
			delete project.tickets[folderName];
			this.repository.writeJson(this.paths.diffReviewStateFile(projectSlug), project);
		});
	}

	updateTicket(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		update: (ticket: DiffReviewTicketState) => DiffReviewTicketState,
		owner?: string,
	): DiffReviewTicketState {
		requireSafeSlug(folderName);
		return this.updateProject(projectSlug, project => {
			const updated = update(getReviewTicketState(project, folderName, worktreeIdentity));
			if (updated.worktreeIdentity !== worktreeIdentity) {
				throw new Error("The Ticket worktree changed. Refresh Diff Review.");
			}
			return { ...project, tickets: { ...project.tickets, [folderName]: updated } };
		}, owner).tickets[folderName];
	}

	private withState(
		item: ReviewPromptQueueItem,
		state:
			| { state: "waiting" }
			| { state: "delivering"; deliveryStartedAt: string }
			| { state: "sent"; sentAt: string }
			| { state: "error"; error: string }
			| { state: "uncertain"; error: string },
	): ReviewPromptQueueItem {
		return {
			id: item.id,
			createdAt: item.createdAt,
			feedback: item.feedback,
			snapshot: item.snapshot,
			...state,
		};
	}
}
