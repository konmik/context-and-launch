import { expect, it } from 'vitest';
import { createRoot, createSignal, flush } from 'solid-js';
import { createTicketOrderStorage } from './ticket-order-storage.js';
import { moveTicketInOrder, type TicketOrder } from '~/core/ticket/ticket-order-data.js';
import { fail, succeed } from '~/util/result.js';

it('updates fresh disk order, publishes only successful writes, and follows refreshed snapshots', async () => {
	let dispose!: () => void;
	let disk: TicketOrder = { todo: ['a', 'b', 'external'] };
	let reject = false;
	const [snapshot, setSnapshot] = createSignal<TicketOrder>({ todo: ['a', 'b'] });
	const storage = createRoot(cleanup => {
		dispose = cleanup;
		return createTicketOrderStorage({ projectSlug: 'one', get order() { return snapshot(); } }, {
			read: async () => succeed(disk),
			save: async (_project, expected, next) => {
				if (reject) return fail('conflict');
				expect(expected).toBe(disk);
				disk = next;
				return succeed(disk);
			},
		});
	});
	try {
		flush();
		await storage.update(current => moveTicketInOrder(current, 'a', 'todo', 'todo', 2));
		expect(storage.get()).toEqual({ todo: ['b', 'external', 'a'] });
		reject = true;
		expect(await storage.update(() => ({}))).toEqual(fail('conflict'));
		expect(storage.get()).toEqual(disk);
		flush(() => setSnapshot({ done: ['external'] }));
		await storage.refresh();
		expect(storage.get()).toEqual({ done: ['external'] });
	} finally { dispose(); }
});

it('keeps an in-flight save with its original project when navigation changes the context', async () => {
	let dispose!: () => void;
	let finishRead!: () => void;
	let startedRead!: () => void;
	const reading = new Promise<void>(resolve => { startedRead = resolve; });
	const release = new Promise<void>(resolve => { finishRead = resolve; });
	const saved = new Map<string, TicketOrder>([['first', { todo: ['a'] }], ['second', { todo: ['b'] }]]);
	const [selected, setSelected] = createSignal('first');
	const storage = createRoot(cleanup => {
		dispose = cleanup;
		return createTicketOrderStorage({
			get projectSlug() { return selected(); },
			get order() { return saved.get(selected())!; },
		}, {
			async read(projectSlug) {
				startedRead();
				await release;
				return succeed(saved.get(projectSlug)!);
			},
			async save(projectSlug, _expected, next) {
				saved.set(projectSlug, next);
				return succeed(next);
			},
		});
	});
	try {
		flush();
		const completion = storage.update(current => ({ todo: [...current.todo, 'new'] }));
		await reading;
		flush(() => setSelected('second'));
		finishRead();
		await completion;
		expect(saved.get('first')).toEqual({ todo: ['a', 'new'] });
		expect(storage.get()).toEqual({ todo: ['b'] });
	} finally { dispose(); }
});
