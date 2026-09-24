import { createMemo, createSignal } from "solid-js";
import type { Result } from "~/util/result.js";

export interface ReviewedLineRef {
	id: string;
	path: string;
}

export function createReviewedLineTracker(options: {
	saved(): ReadonlySet<string>;
	persist(lines: ReviewedLineRef[]): Promise<Result<void, string>>;
	onError(message: string): void;
	debounceMs?: number;
}) {
	const pending = new Map<string, string>();
	const [optimistic, setOptimistic] = createSignal<ReadonlySet<string>>(new Set());
	const reviewedLineIds = createMemo(() => new Set([...options.saved(), ...optimistic()]));
	let timer: ReturnType<typeof setTimeout> | undefined;
	let flushing: Promise<void> | undefined;
	let disposed = false;

	const publish = () => setOptimistic(new Set(pending.keys()));
	const schedule = () => {
		if (disposed || flushing || timer !== undefined || pending.size === 0) return;
		timer = setTimeout(() => {
			timer = undefined;
			void flush();
		}, options.debounceMs ?? 400);
	};

	async function flush(): Promise<void> {
		if (flushing) return flushing;
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
		flushing = (async () => {
			while (pending.size > 0) {
				const batch = [...pending].map(([id, path]) => ({ id, path }));
				try {
					const result = await options.persist(batch);
					if (result.type === "Failure") throw new Error(result.error);
				} catch (error) {
					options.onError(error instanceof Error ? error.message : String(error));
				} finally {
					for (const line of batch) pending.delete(line.id);
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
			if (options.saved().has(line.id) || pending.has(line.id)) return;
			pending.set(line.id, line.path);
			publish();
			schedule();
		},
		flush,
		async dispose() {
			disposed = true;
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			await flush();
		},
	};
}
