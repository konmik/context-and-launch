import type { DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";
import type { StoredSignal } from "~/util/stored-signal.js";
import { createStoredConfig } from "~/util/stored-config.js";
import {
	readDiffReviewState, saveDiffReviewState, releaseDiffReviewState,
} from "./diff-review-state-api.js";

export function createDiffReviewStorage(projectSlug: string): StoredSignal<DiffReviewProjectState> {
	return createStoredConfig(
		readDiffReviewState.bind(null, projectSlug),
		saveDiffReviewState.bind(null, projectSlug),
		releaseDiffReviewState.bind(null, projectSlug));
}
