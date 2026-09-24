import type { DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";
import { createStoredSignal, type StoredSignal } from "~/util/stored-signal.js";
import { transformConfig } from "~/util/transform-config.js";
import {
	readDiffReviewState, saveDiffReviewState, releaseDiffReviewState,
} from "./diff-review-state-api.js";

export function createDiffReviewStorage(projectSlug: string): StoredSignal<DiffReviewProjectState> {
	return createStoredSignal(async () => {
		const result = await readDiffReviewState(projectSlug);
		if (result.type === "Failure") throw new Error(result.error);
		return result.value;
	}, transform => transformConfig(transform,
		owner => readDiffReviewState(projectSlug, owner),
		(json, owner) => saveDiffReviewState(projectSlug, json, owner),
		owner => releaseDiffReviewState(projectSlug, owner)));
}
