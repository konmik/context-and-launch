import { createMemo, createSignal, type Accessor } from 'solid-js';
import { fail, succeed, type Result } from './result.js';
import type { Updater } from './updater.js';
import { errorMessage } from '~/core/shared/errors.js';

export interface StoredSignal<T> {
	get: Accessor<T>;
	update(transform: Updater<T>): Promise<Result<void, string>>;
	refresh(): Promise<Result<void, string>>;
}

export function createStoredSignal<T>(
	read: () => T | Promise<T>,
	persist: (transform: Updater<T>) => Promise<Result<T, string>>,
): StoredSignal<T> {
	const initial = createMemo(read);
	const [saved, setSaved] = createSignal<{ value: T }>();
	let pending = Promise.resolve();
	function publish(load: () => Promise<Result<T, string>>): Promise<Result<void, string>> {
		const operation = pending.then(async (): Promise<Result<void, string>> => {
			try {
				const next = await load();
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
	return {
		get: () => saved()?.value ?? initial(),
		update: transform => publish(() => persist(transform)),
		refresh: () => publish(async () => succeed(await read())),
	};
}
