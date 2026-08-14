import { query } from "@solidjs/router";
import {
	diffReviewGitService,
	diffReviewStore,
	diffReviewTargetResolver,
	reviewPromptQueueService,
} from "~/core/config/instances.js";
import { errorMessage, errorResult } from "~/core/shared/errors.js";
import type {
	DiffScope,
	ReviewPromptSnapshot,
} from "~/core/diff-review/diff-review-types.js";

/**
 * The Diff Scopes a Ticket offers and the snapshot of one of them travel
 * together: opening the Diff Review costs one round trip, and the client never
 * has to learn which scopes exist before it can ask for a diff.
 */
export const getReviewSnapshot = query(async (
	projectSlug: string,
	folderName: string,
	requestedScope?: DiffScope,
) => {
	"use server";
	const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
	const scopes: DiffScope[] = target.mainBranch
		? ["all", "branch", "working", "last-commit"]
		: ["working", "last-commit"];
	const scope = requestedScope ?? scopes[0];
	if (!scopes.includes(scope)) {
		throw new Error(`This Ticket has no '${scope}' Diff Scope.`);
	}
	// Git failing on one Diff Scope says nothing about the others, so it travels
	// back as this scope's answer instead of as the whole query's failure. The
	// Diff Review keeps its scope picker and the user can move to a scope Git
	// can calculate.
	let snapshot;
	try {
		snapshot = await diffReviewGitService.loadSnapshot(target, scope);
	} catch (error) {
		return { scopes, scope, error: errorMessage(error) };
	}
	const state = diffReviewStore.ensureTicket(
		projectSlug,
		folderName,
		target.worktreeIdentity,
	);
	return {
		scopes,
		scope,
		snapshot: {
			...snapshot,
			reviewedLineIds: Object.keys(state.reviewedLines),
		},
	};
}, "diff-review-snapshot");

/**
 * The queue travels with whether an Agent is running for the Ticket. Herdr is
 * not the only Agent this Ticket can have: the queue starts one from the
 * launcher profile, and that Agent leaves a marker rather than a Herdr report.
 * The queue service answers from both, so a running Agent of either kind never
 * reads as no Agent.
 */
export const getReviewPromptQueue = query(async (
	projectSlug: string,
	folderName: string,
) => {
	"use server";
	const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
	const queue = diffReviewStore.getTicket(
		projectSlug,
		folderName,
		target.worktreeIdentity,
	).queue;
	return {
		...queue,
		agentRunning: reviewPromptQueueService.isAgentRunning(projectSlug, folderName),
	};
}, "diff-review-queue");

/**
 * Every Diff Review mutation resolves the Ticket the same way and reports a
 * failure the same way, so each one only has to say what it does to the store.
 */
async function withResolvedTicket<T>(
	projectSlug: string,
	folderName: string,
	run: (worktreeIdentity: string) => T,
) {
	try {
		const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
		return { ok: true as const, value: run(target.worktreeIdentity) };
	} catch (error) {
		return errorResult(error);
	}
}

export async function markReviewLinesReviewed(
	projectSlug: string,
	folderName: string,
	lines: { id: string; path: string }[],
) {
	"use server";
	return withResolvedTicket(projectSlug, folderName, (worktreeIdentity) => {
		diffReviewStore.markLinesReviewed(projectSlug, folderName, worktreeIdentity, lines);
	});
}

export async function enqueueReviewPrompt(
	projectSlug: string,
	folderName: string,
	feedback: string,
	profileName: string | undefined,
	snapshot?: ReviewPromptSnapshot,
) {
	"use server";
	try {
		const item = await reviewPromptQueueService.enqueueAndLaunch(
			projectSlug, folderName, feedback, snapshot, profileName,
		);
		return { ok: true as const, item };
	} catch (error) {
		return errorResult(error);
	}
}

export async function launchReviewAgent(
	projectSlug: string,
	folderName: string,
	profileName: string,
) {
	"use server";
	try {
		await reviewPromptQueueService.launchWithQueueHead(projectSlug, folderName, profileName);
		return { ok: true as const };
	} catch (error) {
		return errorResult(error);
	}
}

export async function removeReviewPrompt(
	projectSlug: string,
	folderName: string,
	itemId: string,
) {
	"use server";
	return withResolvedTicket(projectSlug, folderName, (worktreeIdentity) => {
		diffReviewStore.removeQueueItem(projectSlug, folderName, worktreeIdentity, itemId);
	});
}

export async function retryReviewPrompt(
	projectSlug: string,
	folderName: string,
	itemId: string,
	profileName: string | undefined,
) {
	"use server";
	try {
		await reviewPromptQueueService.retryAndLaunch(
			projectSlug, folderName, itemId, profileName,
		);
		return { ok: true as const };
	} catch (error) {
		return errorResult(error);
	}
}
