import type { Updater } from './updater.js';
import { fail, type Result } from './result.js';
import { errorMessage } from '~/core/shared/errors.js';

export async function transformConfig<T>(
	transform: Updater<T>,
	read: (owner: string) => Promise<Result<T, string>>,
	save: (json: string, owner: string) => Promise<Result<T, string>>,
	release: (owner: string) => Promise<void>,
): Promise<Result<T, string>> {
	const owner = crypto.randomUUID();
	try {
		const current = await read(owner);
		if (current.type === 'Failure') return current;
		try {
			return await save(JSON.stringify(transform(current.value)), owner);
		} finally {
			await release(owner);
		}
	} catch (error) {
		return fail(errorMessage(error));
	}
}
