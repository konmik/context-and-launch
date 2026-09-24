import type { Result } from './result.js';
import { createStoredSignal, type StoredSignal } from './stored-signal.js';

export function createStoredConfig<T>(
	read: (owner?: string) => Promise<Result<T, string>>,
	save: (json: string, owner: string) => Promise<Result<T, string>>,
	release: (owner: string) => Promise<void>,
): StoredSignal<T> {
	return createStoredSignal(async () => {
		const result = await read();
		if (result.type === 'Failure') throw new Error(result.error);
		return result.value;
	}, async transform => {
		const owner = crypto.randomUUID();
		const current = await read(owner);
		if (current.type === 'Failure') return current;
		try {
			return await save(JSON.stringify(transform(current.value)), owner);
		} finally {
			await release(owner);
		}
	});
}
