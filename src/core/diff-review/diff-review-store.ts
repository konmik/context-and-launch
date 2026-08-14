import { randomUUID } from "node:crypto";
import * as v from "valibot";
import type { ConfigPaths } from "../config/config-paths.js";
import type { ConfigRepository } from "../config/config-repository.js";
import { requireSafeSlug } from "../config/config-paths.js";
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

function emptyProjectState(): DiffReviewProjectState {
	return { version: 2, tickets: {} };
}

function emptyTicketState(worktreeIdentity: string): DiffReviewTicketState {
	return {
		worktreeIdentity,
		reviewedLines: {},
		queue: { items: [] },
	};
}

export class DiffReviewStore {
	constructor(
		private readonly paths: ConfigPaths,
		private readonly repository: ConfigRepository,
	) {}

	loadProject(projectSlug: string): DiffReviewProjectState {
		requireSafeSlug(projectSlug);
		const filePath = this.paths.diffReviewStateFile(projectSlug);
		const raw = this.repository.readJson(filePath);
		if (raw === null) return emptyProjectState();
		const parsed = v.safeParse(ProjectStateSchema, raw);
		if (parsed.success) return parsed.output as DiffReviewProjectState;
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
	): DiffReviewTicketState {
		requireSafeSlug(folderName);
		const project = this.loadProject(projectSlug);
		const existing = project.tickets[folderName];
		return existing?.worktreeIdentity === worktreeIdentity
			? structuredClone(existing)
			: emptyTicketState(worktreeIdentity);
	}

	ensureTicket(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
	): DiffReviewTicketState {
		requireSafeSlug(folderName);
		const project = this.loadProject(projectSlug);
		const existing = project.tickets[folderName];
		if (existing?.worktreeIdentity === worktreeIdentity) {
			return structuredClone(existing);
		}
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => ticket);
	}

	markLinesReviewed(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		lines: { id: string; path: string }[],
	): DiffReviewTicketState {
		const reviewedAt = new Date().toISOString();
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			for (const line of lines) {
				ticket.reviewedLines[line.id] = { path: line.path, reviewedAt };
			}
			return ticket;
		});
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
		let created: ReviewPromptQueueItem | undefined;
		this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			created = {
				id: randomUUID(),
				createdAt: new Date().toISOString(),
				feedback: normalizedFeedback,
				snapshot: snapshot ? structuredClone(snapshot) : undefined,
				state: "waiting",
			};
			ticket.queue.items.push(created);
			return ticket;
		});
		return created!;
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

	requestAgentLaunch(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		profileName: string,
	): DiffReviewTicketState {
		if (!profileName.trim()) throw new Error("An Agent launch requires a profile.");
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			ticket.queue.requestedAgentProfileName = profileName;
			return ticket;
		});
	}

	clearAgentLaunchRequest(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			delete ticket.queue.requestedAgentProfileName;
			return ticket;
		});
	}

	removeQueueItem(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		itemId: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			const removedHead = ticket.queue.items[0]?.id === itemId;
			const item = ticket.queue.items.find((candidate) => candidate.id === itemId);
			if (!item) throw new Error("That Review Prompt is no longer in the queue.");
			if (
				item.state !== "waiting"
				&& item.state !== "error"
				&& item.state !== "uncertain"
			) {
				throw new Error(
					`This Review Prompt is already ${item.state} and can no longer be removed.`,
				);
			}
			ticket.queue.items = ticket.queue.items.filter((candidate) => candidate.id !== itemId);
			if (removedHead) delete ticket.queue.requestedAgentProfileName;
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
			return ticket;
		});
	}

	completeAgentLaunch(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		cooldownUntil: Date,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			delete ticket.queue.agentLaunchReservedUntil;
			ticket.queue.cooldownUntil = cooldownUntil.toISOString();
			return ticket;
		});
	}

	clearAgentLaunchReservation(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			delete ticket.queue.agentLaunchReservedUntil;
			return ticket;
		});
	}

	recoverInterrupted(projectSlug: string): void {
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
		if (changed) this.saveProject(projectSlug, project);
	}

	removeTicket(projectSlug: string, folderName: string): void {
		requireSafeSlug(folderName);
		const project = this.loadProject(projectSlug);
		if (!Object.hasOwn(project.tickets, folderName)) return;
		delete project.tickets[folderName];
		this.saveProject(projectSlug, project);
	}

	private updateTicket(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		update: (ticket: DiffReviewTicketState) => DiffReviewTicketState,
	): DiffReviewTicketState {
		requireSafeSlug(folderName);
		const project = this.loadProject(projectSlug);
		const existing = project.tickets[folderName];
		const ticket = existing?.worktreeIdentity === worktreeIdentity
			? structuredClone(existing)
			: emptyTicketState(worktreeIdentity);
		const updated = update(ticket);
		project.tickets[folderName] = updated;
		this.saveProject(projectSlug, project);
		return structuredClone(updated);
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

	private saveProject(projectSlug: string, project: DiffReviewProjectState): void {
		this.repository.writeJson(this.paths.diffReviewStateFile(projectSlug), project);
	}
}
