import { query } from "@solidjs/router";
import {
	diffReviewGitService,
	diffReviewStore,
	diffReviewTargetResolver,
} from "~/core/config/instances.js";
import { errorResult } from "~/core/shared/errors.js";
import type {
	DiffScope,
	ReviewPromptSnapshot,
} from "~/core/diff-review/diff-review-types.js";

export const getReviewScopes = query(async (
	projectSlug: string,
	folderName: string,
): Promise<DiffScope[]> => {
	"use server";
	const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
	return target.mainBranch
		? ["all", "branch", "working", "last-commit"]
		: ["working", "last-commit"];
}, "diff-review-scopes");

export const getReviewSnapshot = query(async (
	projectSlug: string,
	folderName: string,
	scope: DiffScope,
) => {
	"use server";
	const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
	const snapshot = await diffReviewGitService.loadSnapshot(target, scope);
	const state = diffReviewStore.ensureTicket(
		projectSlug,
		folderName,
		target.worktreeIdentity,
	);
	return {
		...snapshot,
		reviewedLineIds: Object.keys(state.reviewedLines),
	};
}, "diff-review-snapshot");

export const getReviewPromptQueue = query(async (
	projectSlug: string,
	folderName: string,
) => {
	"use server";
	const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
	return diffReviewStore.ensureTicket(
		projectSlug,
		folderName,
		target.worktreeIdentity,
	).queue;
}, "diff-review-queue");

export async function markReviewLinesReviewed(
	projectSlug: string,
	folderName: string,
	lines: { id: string; path: string }[],
) {
	"use server";
	try {
		const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
		diffReviewStore.markLinesReviewed(
			projectSlug,
			folderName,
			target.worktreeIdentity,
			lines,
		);
		return { ok: true as const };
	} catch (error) {
		return errorResult(error);
	}
}

export async function enqueueReviewPrompt(
	projectSlug: string,
	folderName: string,
	feedback: string,
	snapshot?: ReviewPromptSnapshot,
) {
	"use server";
	try {
		const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
		const item = diffReviewStore.enqueue(
			projectSlug,
			folderName,
			target.worktreeIdentity,
			feedback,
			snapshot,
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
) {
	"use server";
	try {
		const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
		diffReviewStore.retry(
			projectSlug,
			folderName,
			target.worktreeIdentity,
			itemId,
		);
		return { ok: true as const };
	} catch (error) {
		return errorResult(error);
	}
}
