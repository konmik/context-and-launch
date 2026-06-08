export class OperationTracker {
	private pending = new Set<Promise<unknown>>();

	track<T>(operation: Promise<T>): Promise<T> {
		this.pending.add(operation);
		const cleanup = () => { this.pending.delete(operation); };
		operation.then(cleanup, cleanup);
		return operation;
	}

	hasPending(): boolean {
		return this.pending.size > 0;
	}

	async waitForAll(): Promise<void> {
		while (this.pending.size > 0) {
			await Promise.allSettled([...this.pending]);
		}
	}
}
