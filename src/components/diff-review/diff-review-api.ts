import { query } from "@solidjs/router";
import {
	diffReviewGitService,
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
	requestedScope?: DiffScope | null,
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
	return { scopes, scope, snapshot };
}, "diff-review-snapshot");

/**
 * Herdr is not the only Agent this Ticket can have: the queue starts one from the
 * launcher profile, and that Agent leaves a marker rather than a Herdr report.
 * The queue service answers from both, so a running Agent of either kind never
 * reads as no Agent.
 */
export const getReviewAgentStatus = query(async (
	projectSlug: string,
	folderName: string,
) => {
	"use server";
	return {
		worktreeIdentity: diffReviewTargetResolver.resolve(projectSlug, folderName).worktreeIdentity,
		agentRunning: reviewPromptQueueService.isAgentRunning(projectSlug, folderName),
	};
}, "diff-review-agent");

export async function enqueueReviewPrompt(
	projectSlug: string,
	folderName: string,
	feedback: string,
	profileName: string | null,
	snapshot: ReviewPromptSnapshot | null,
) {
	"use server";
	try {
		const item = await reviewPromptQueueService.enqueueAndLaunch(
			projectSlug, folderName, feedback, snapshot ?? undefined, profileName ?? undefined,
		);
		return { ok: true as const, item };
	} catch (error) {
		return errorResult(error);
	}
}

export async function retryReviewPrompt(
	projectSlug: string,
	folderName: string,
	itemId: string,
	profileName: string | null,
) {
	"use server";
	try {
		await reviewPromptQueueService.retryAndLaunch(
			projectSlug, folderName, itemId, profileName ?? undefined,
		);
		return { ok: true as const };
	} catch (error) {
		return errorResult(error);
	}
}
