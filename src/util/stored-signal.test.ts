import { describe, expect, it } from 'vitest';
import { createRoot, flush } from 'solid-js';
import { createStoredSignal } from './stored-signal.js';
import { fail, succeed } from './result.js';

describe('stored signal', () => {
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
