import type { Accessor } from 'solid-js';
import { succeed, type Result } from './result.js';
import type { Updater } from './updater.js';
import { createStoredState } from './stored-state.js';

export interface StoredSignal<T> {
	get: Accessor<T>;
	update(transform: Updater<T>): Promise<Result<void, string>>;
	refresh(): Promise<Result<void, string>>;
}

export function createStoredSignal<T>(
	read: () => T | Promise<T>,
	persist: (transform: Updater<T>) => Promise<Result<T, string>>,
): StoredSignal<T> {
	const state = createStoredState(read);
	return {
		get: state.get,
		update: transform => state.enqueueAndPublish(() => persist(transform)),
		refresh: () => state.enqueueAndPublish(async () => succeed(await read())),
	};
}
