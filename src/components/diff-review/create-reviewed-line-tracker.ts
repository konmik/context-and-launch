import { createSignal, type Accessor } from "solid-js";

export interface ReviewedLineRef {
	id: string;
	path: string;
}

export interface ReviewedLineTracker {
	reviewedLineIds: Accessor<ReadonlySet<string>>;
	mergeAcknowledged(lineIds: readonly string[]): void;
	markVisible(line: ReviewedLineRef): void;
	flush(): Promise<void>;
	dispose(): Promise<void>;
}

export function createReviewedLineTracker(options: {
	persist(lines: ReviewedLineRef[]): Promise<{ ok: boolean; message?: string }>;
	onError(message: string): void;
	debounceMs?: number;
}): ReviewedLineTracker {
	const acknowledged = new Set<string>();
	const pending = new Map<string, string>();
	const inFlight = new Map<string, string>();
	const [reviewedLineIds, setReviewedLineIds] = createSignal<ReadonlySet<string>>(new Set());
	let timer: ReturnType<typeof setTimeout> | undefined;
	let flushing: Promise<void> | undefined;
	let disposed = false;

	const publish = () => setReviewedLineIds(new Set([
		...acknowledged,
		...pending.keys(),
		...inFlight.keys(),
	]));
	const schedule = () => {
		if (disposed || timer !== undefined || pending.size === 0) return;
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
				pending.clear();
				for (const line of batch) inFlight.set(line.id, line.path);
				publish();
				try {
					const result = await options.persist(batch);
					if (!result.ok) throw new Error(result.message ?? "Could not save reviewed lines.");
					for (const line of batch) acknowledged.add(line.id);
				} catch (error) {
					options.onError(error instanceof Error ? error.message : String(error));
				} finally {
					for (const line of batch) inFlight.delete(line.id);
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
		mergeAcknowledged(lineIds) {
			for (const lineId of lineIds) {
				acknowledged.add(lineId);
				pending.delete(lineId);
				inFlight.delete(lineId);
			}
			publish();
		},
		markVisible(line) {
			if (disposed) return;
			if (acknowledged.has(line.id) || pending.has(line.id) || inFlight.has(line.id)) return;
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
