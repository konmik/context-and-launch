import { createSignal, type Accessor } from 'solid-js';
import { fail, succeed, type Result } from './result.js';
import type { Updater } from './updater.js';
import { errorMessage } from '~/core/shared/errors.js';

export interface StoredSignal<T> {
	get: Accessor<T>;
	update(transform: Updater<T>): Promise<Result<void, string>>;
}

export function createStoredSignal<T>(
	initial: Accessor<T>,
	persist: (transform: Updater<T>) => Promise<Result<T, string>>,
): StoredSignal<T> {
	const [saved, setSaved] = createSignal<{ value: T }>();
	let pending = Promise.resolve();
	function update(transform: Updater<T>): Promise<Result<void, string>> {
		const operation = pending.then(async (): Promise<Result<void, string>> => {
			try {
				const next = await persist(transform);
				if (next.type === 'Failure') return next;
				setSaved({ value: next.value });
				return succeed(undefined);
			} catch (error) {
				return fail(errorMessage(error));
			}
		});
		pending = operation.then(() => {});
		return operation;
	}
	return { get: () => saved()?.value ?? initial(), update };
}
