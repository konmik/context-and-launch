import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '~/test-render.js';
import { createSignal, createMemo, Loading } from 'solid-js';
import { BoardConfigContext } from '../board/board-config-storage.js';
import { createStoredSignal } from '~/util/stored-signal.js';
import { fail, succeed } from '~/util/result.js';
import type { BoardDefinition } from '~/core/project/board-config-data.js';
import BoardSelector from './BoardSelector.js';

afterEach(cleanup);

it('shares successful edits across mounted selectors and keeps failed edits unpublished', async () => {
	let saved: BoardDefinition[] = [
		{ id: 'first', name: 'First', columns: [] },
		{ id: 'second', name: 'Second', columns: [] },
	];
	let reject = false;
	const initial = createMemo(async () => saved);
	const storage = createStoredSignal(initial, async transform => {
		if (reject) return fail('write failed');
		saved = transform(saved);
		return succeed(saved);
	});
	function Selector() {
		const [id, setId] = createSignal('second');
		return <BoardSelector boardId={id()} setBoardId={setId} />;
	}
	render(() => <Loading><BoardConfigContext value={storage}><Selector /><Selector /></BoardConfigContext></Loading>);
	const selects = () => screen.getAllByRole('combobox').filter((element): element is HTMLSelectElement =>
		element instanceof HTMLSelectElement);
	await waitFor(() => expect(selects().map(s => s.value)).toEqual(['second', 'second']));
	await storage.update(boards => boards.map(b => b.id === 'second' ? { ...b, name: 'Updated' } : b));
	await waitFor(() => expect(screen.getAllByRole('option', { name: 'Updated' })).toHaveLength(2));
	reject = true;
	expect(await storage.update(boards => boards.filter(b => b.id !== 'second'))).toEqual(fail('write failed'));
	expect(selects().map(s => s.value)).toEqual(['second', 'second']);
	reject = false;
	await storage.update(boards => [
		...boards.filter(b => b.id !== 'second'), { id: 'third', name: 'Third', columns: [] },
	]);
	await waitFor(() => expect(selects().map(s => s.value)).toEqual(['first', 'first']));
	expect(screen.queryByRole('option', { name: 'Updated' })).toBeNull();
});
