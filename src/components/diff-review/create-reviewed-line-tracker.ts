import { createMemo, createSignal } from "solid-js";
import type { StoredSignal } from "~/util/stored-signal.js";
import { getReviewTicketState, type DiffReviewProjectState } from "~/core/diff-review/diff-review-types.js";

export interface ReviewedLineRef {
	id: string;
	path: string;
}

export function createReviewedLineTracker(options: {
	state: StoredSignal<DiffReviewProjectState>;
	folderName: string;
	worktreeIdentity: string;
	onError(message: string): void;
}) {
	const { state, folderName, worktreeIdentity } = options;
	const saved = createMemo(() => new Set(Object.keys(
		getReviewTicketState(state.get(), folderName, worktreeIdentity).reviewedLines,
	)));
	const pending = new Map<string, string>();
	const [optimistic, setOptimistic] = createSignal<ReadonlySet<string>>(new Set());
	const reviewedLineIds = createMemo(() => new Set([...saved(), ...optimistic()]));
	let timer: ReturnType<typeof setTimeout> | undefined;
	let flushing: Promise<void> | undefined;
	let disposed = false;

	const publish = () => setOptimistic(new Set(pending.keys()));
	const schedule = () => {
		if (disposed || flushing || timer !== undefined || pending.size === 0) return;
		timer = setTimeout(() => void flush(), 400);
	};

	async function flush(): Promise<void> {
		if (flushing) return flushing;
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
		flushing = (async () => {
			while (pending.size > 0) {
				const batch = [...pending];
				try {
					const reviewedAt = new Date().toISOString();
					const result = await state.update(current => {
						const ticket = getReviewTicketState(current, folderName, worktreeIdentity);
						return { ...current, tickets: { ...current.tickets, [folderName]: { ...ticket,
							reviewedLines: { ...ticket.reviewedLines, ...Object.fromEntries(
								batch.map(([id, path]) => [id, { path, reviewedAt }]),
							) },
						} } };
					});
					if (result.type === "Failure") throw new Error(result.error);
				} catch (error) {
					options.onError(error instanceof Error ? error.message : String(error));
				} finally {
					for (const [id] of batch) pending.delete(id);
					publish();
				}
			}
		})();
		try {
			await flushing;
		} finally {
			flushing = undefined;
			if (pending.size > 0) {
				if (disposed) await flush();
				else schedule();
			}
		}
	}

	return {
		reviewedLineIds,
		markVisible(line: ReviewedLineRef) {
			if (disposed) return;
			if (saved().has(line.id) || pending.has(line.id)) return;
			pending.set(line.id, line.path);
			publish();
			schedule();
		},
		flush,
		dispose() {
			disposed = true;
			return flush();
		},
	};
}
