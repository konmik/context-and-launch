import { createMemo, createSignal, type Accessor } from 'solid-js';
import { errorMessage } from '~/core/shared/errors.js';
import { fail, succeed, type Result } from './result.js';

export interface StoredState<T> {
	get: Accessor<T>;
	enqueueAndPublish(operation: () => Promise<Result<T, string>>): Promise<Result<void, string>>;
}

export function createStoredState<T>(read: () => T | Promise<T>): StoredState<T> {
	const initial = createMemo(read);
	const [saved, setSaved] = createSignal<{ value: T }>();
	let pending = Promise.resolve();
	function enqueueAndPublish(operation: () => Promise<Result<T, string>>): Promise<Result<void, string>> {
		const completion = pending.then(async (): Promise<Result<void, string>> => {
			try {
				const next = await operation();
				if (next.type === 'Failure') return next;
				setSaved({ value: next.value });
				return succeed(undefined);
			} catch (error) {
				return fail(errorMessage(error));
			}
		});
		pending = completion.then(() => {});
		return completion;
	}
	return {
		get: () => saved()?.value ?? initial(),
		enqueueAndPublish,
	};
}
