import { GET } from "@solidjs/web/server-functions";
import { diffReviewStore, diffReviewTargetResolver } from "~/core/config/instances.js";
import type { DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";
import { errorMessage } from "~/core/shared/errors.js";
import { fail, succeed } from "~/util/result.js";

export const readDiffReviewState = GET(async (projectSlug: string, owner?: string) => {
	"use server";
	try {
		return succeed(diffReviewStore.loadProject(projectSlug, owner));
	} catch (error) {
		return fail(errorMessage(error));
	}
});

export async function saveDiffReviewState(projectSlug: string, json: string, owner: string) {
	"use server";
	try {
		if (!owner) return fail("Configuration update requires a client identity.");
		return succeed(diffReviewStore.updateProject(projectSlug, current => {
			const next: DiffReviewProjectState = JSON.parse(json);
			for (const [folderName, ticket] of Object.entries(next.tickets)) {
				if (JSON.stringify(ticket) === JSON.stringify(current.tickets[folderName])) continue;
				const target = diffReviewTargetResolver.resolve(projectSlug, folderName);
				if (ticket.worktreeIdentity !== target.worktreeIdentity) {
					throw new Error("The Ticket worktree changed. Refresh Diff Review.");
				}
			}
			return next;
		}, owner));
	} catch (error) {
		return fail(errorMessage(error));
	}
}

export async function releaseDiffReviewState(projectSlug: string, owner: string) {
	"use server";
	diffReviewStore.release(projectSlug, owner);
}
