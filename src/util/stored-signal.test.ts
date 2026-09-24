import { describe, expect, it } from 'vitest';
import { createRoot, flush } from 'solid-js';
import { createStoredSignal } from './stored-signal.js';
import { fail, succeed } from './result.js';

describe('stored signal', () => {
	it('serializes a delayed refresh with updates and reads again after a completed update', async () => {
		await createRoot(async dispose => {
			try {
				let persisted = { count: 1 };
				let reading: Promise<{ count: number }> | undefined;
				let finishRead!: (value: { count: number }) => void;
				const events: string[] = [];
				const store = createStoredSignal(() => {
					events.push('read');
					return reading ?? persisted;
				}, async transform => {
					events.push('update');
					persisted = transform(persisted);
					return succeed(persisted);
				});
				expect(store.get()).toEqual({ count: 1 });
				events.length = 0;
				reading = new Promise(resolve => { finishRead = resolve; });
				const refreshing = store.refresh();
				const updating = store.update(current => ({ count: current.count + 1 }));
				await Promise.resolve();
				expect(events).toEqual(['read']);
				persisted = { count: 10 };
				finishRead({ count: 2 });
				await Promise.all([refreshing, updating]);
				flush();
				expect(store.get()).toEqual({ count: 11 });
				reading = undefined;
				persisted = { count: 20 };
				await store.refresh();
				flush();
				expect(store.get()).toEqual({ count: 20 });
				expect(events).toEqual(['read', 'update', 'read']);
			} finally { dispose(); }
		});
	});

	it('retains the last saved state on refresh failure and permits subsequent operations', async () => {
		await createRoot(async dispose => {
			try {
				let persisted = { count: 1 };
				let failed = false;
				const store = createStoredSignal(() => {
					if (failed) throw new Error('Read failed');
					return persisted;
				}, async transform => succeed(persisted = transform(persisted)));
				await store.update(() => ({ count: 2 }));
				failed = true;
				expect(await store.refresh()).toEqual(fail('Read failed'));
				flush();
				expect(store.get()).toEqual({ count: 2 });
				failed = false;
				persisted = { count: 5 };
				await store.refresh();
				await store.update(current => ({ count: current.count + 1 }));
				flush();
				expect(store.get()).toEqual({ count: 6 });
			} finally { dispose(); }
		});
	});

	it('serializes transforms against fresh reads and publishes the server result', async () => {
		await createRoot(async dispose => {
			try {
				let persisted = { count: 10 };
				const events: string[] = [];
				const store = createStoredSignal(() => ({ count: 0 }), async transform => {
					events.push('read');
					const next = transform(persisted);
					await Promise.resolve();
					events.push('save');
					persisted = { count: next.count + 1 };
					return succeed(persisted);
				});
				const first = store.update(value => ({ count: value.count + 1 }));
				const second = store.update(value => ({ count: value.count + 1 }));
				expect(store.get()).toEqual({ count: 0 });
				await Promise.all([first, second]);
				flush();
				expect(store.get()).toEqual({ count: 14 });
				expect(events).toEqual(['read', 'save', 'read', 'save']);
			} finally { dispose(); }
		});
	});

	it('retains state after failures and allows the next queued update', async () => {
		await createRoot(async dispose => {
			try {
				let attempts = 0;
				const store = createStoredSignal(() => ({ count: 1 }), async transform => {
					const next = transform({ count: 1 });
					return attempts++ === 0 ? fail('Disk write failed') : succeed(next);
				});
				expect(await store.update(() => ({ count: 2 }))).toEqual(fail('Disk write failed'));
				flush();
				expect(store.get()).toEqual({ count: 1 });
				const failed = await store.update(() => { throw new Error('Transform failed'); });
				expect(failed).toEqual(fail('Transform failed'));
				expect(await store.update(() => ({ count: 3 }))).toEqual(succeed(undefined));
				flush();
				expect(store.get()).toEqual({ count: 3 });
			} finally { dispose(); }
		});
	});
});
