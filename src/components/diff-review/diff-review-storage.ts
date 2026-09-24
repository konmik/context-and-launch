import { createMemo } from "solid-js";
import type { DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";
import { createStoredSignal, type StoredSignal } from "~/util/stored-signal.js";
import { transformConfig } from "~/util/transform-config.js";
import type {
	readDiffReviewState, saveDiffReviewState, releaseDiffReviewState,
} from "./diff-review-state-api.js";

interface DiffReviewPersistence {
	read(projectSlug: string, owner?: string): ReturnType<typeof readDiffReviewState>;
	save: typeof saveDiffReviewState;
	release: typeof releaseDiffReviewState;
}

export function createDiffReviewStorage(
	props: { projectSlug: string }, persistence: DiffReviewPersistence,
): StoredSignal<DiffReviewProjectState> {
	const project = createMemo(() => {
		const slug = props.projectSlug;
		return createStoredSignal(async () => {
			const result = await persistence.read(slug);
			if (result.type === "Failure") throw new Error(result.error);
			return result.value;
		}, transform => transformConfig(transform,
			owner => persistence.read(slug, owner),
			(json, owner) => persistence.save(slug, json, owner),
			owner => persistence.release(slug, owner)));
	});
	return {
		// Captured operations stay bound to the project of the view that owns them.
		get get() { return project().get; },
		get update() { return project().update; },
		get refresh() { return project().refresh; },
	};
}
