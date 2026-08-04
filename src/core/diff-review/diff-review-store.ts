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
const QueueItemSchema = v.object({
	id: v.string(),
	createdAt: v.string(),
	feedback: v.string(),
	snapshot: v.optional(PromptSnapshotSchema),
	state: v.picklist(["waiting", "delivering", "sent", "error"]),
	error: v.optional(v.string()),
	deliveryStartedAt: v.optional(v.string()),
	sentAt: v.optional(v.string()),
});
const QueueSchema = v.object({
	items: v.array(QueueItemSchema),
	cooldownUntil: v.optional(v.string()),
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
			if (!head || head.id !== itemId || head.state !== "error") {
				throw new Error("Only the errored head Review Prompt can be retried.");
			}
			head.state = "waiting";
			delete head.error;
			delete head.deliveryStartedAt;
			return ticket;
		});
	}

	updateQueue(
		projectSlug: string,
		folderName: string,
		worktreeIdentity: string,
		update: (ticket: DiffReviewTicketState) => void,
	): DiffReviewTicketState {
		return this.updateTicket(projectSlug, folderName, worktreeIdentity, (ticket) => {
			update(ticket);
			return ticket;
		});
	}

	recoverInterrupted(projectSlug: string): void {
		const project = this.loadProject(projectSlug);
		let changed = false;
		for (const ticket of Object.values(project.tickets)) {
			const recovered = ticket.queue.items.filter((item) => item.state !== "sent");
			if (recovered.length !== ticket.queue.items.length) changed = true;
			ticket.queue.items = recovered;
			for (const item of ticket.queue.items) {
				if (item.state !== "delivering") continue;
				item.state = "waiting";
				delete item.deliveryStartedAt;
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

	private saveProject(projectSlug: string, project: DiffReviewProjectState): void {
		this.repository.writeJson(this.paths.diffReviewStateFile(projectSlug), project);
	}
}
