import { afterEach, expect, it } from 'vitest';
import { flush } from 'solid-js';
import { cleanup, fireEvent, render, screen, waitFor } from '~/test-render.js';
import { createStoredSignal } from '~/util/stored-signal.js';
import { fail, succeed } from '~/util/result.js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js';
import { LauncherConfigContext } from './shared-launcher-config-storage.js';
import { ItemSection } from './launcher-settings-item-section.js';

afterEach(cleanup);

it('shares successful edits, isolates projects, and retains failed drafts', async () => {
	const initial: LauncherConfig = { templates: [], skills: [], profiles: [{ name: 'Agent', command: 'before' }] };
	let persisted = initial;
	let reject = false;
	const storage = createStoredSignal(() => initial, async transform => {
		if (reject) return fail('write failed');
		persisted = transform(persisted);
		return succeed(persisted);
	});
	const other = createStoredSignal(() => initial, async transform => succeed(transform(initial)));
	const shared = createStoredSignal<LauncherConfig>(() => ({ templates: [], skills: [] }),
		async transform => succeed(transform({ templates: [], skills: [] })));
	function Editor() {
		return <ItemSection open heading="Agents" itemType="profile" addButtonTestId="add"
			rowTestId="row" dragHandleTestId="drag" editTestId="edit" deleteTestId="delete" />;
	}
	const { container } = render(() => <LauncherConfigContext value={shared}>
		<ProjectLauncherConfigContext value={storage}><Editor /><Editor /></ProjectLauncherConfigContext>
		<ProjectLauncherConfigContext value={other}><Editor /></ProjectLauncherConfigContext>
	</LauncherConfigContext>);
	const rows = () => [...container.querySelectorAll('[data-testid="row"]')].map(row => row.textContent);
	await waitFor(() => expect(rows()).toHaveLength(3));

	// A different writer changes the file after these editors have mounted.
	persisted = { ...persisted, branchPrefix: 'external/' };
	fireEvent.click(screen.getAllByTestId('edit')[0]);
	await waitFor(() => expect(screen.getByTestId('launcher-settings-item-form-text-input')).toBeTruthy());
	fireEvent.input(screen.getByTestId('launcher-settings-item-form-text-input'), { target: { value: 'after' } });
	flush();
	fireEvent.click(screen.getByTestId('launcher-settings-item-form-submit'));
	await waitFor(() => expect(rows()).toEqual([
		expect.stringContaining('after'), expect.stringContaining('after'), expect.stringContaining('before'),
	]));
	expect(persisted.branchPrefix).toBe('external/');
	await waitFor(() => expect(screen.queryByTestId('launcher-settings-item-form-text-input')).toBeNull());

	reject = true;
	fireEvent.click(screen.getAllByTestId('edit')[0]);
	await waitFor(() => expect(screen.getByTestId('launcher-settings-item-form-text-input')).toBeTruthy());
	fireEvent.input(screen.getByTestId('launcher-settings-item-form-text-input'),
		{ target: { value: 'failed draft' } });
	flush();
	fireEvent.click(screen.getByTestId('launcher-settings-item-form-submit'));
	await waitFor(() => expect(document.body.textContent).toContain('write failed'));
	expect(screen.getByTestId<HTMLTextAreaElement>('launcher-settings-item-form-text-input').value)
		.toBe('failed draft');
	expect(storage.get().profiles?.[0].command).toBe('after');
	expect(rows()).toEqual([
		expect.stringContaining('after'), expect.stringContaining('after'), expect.stringContaining('before'),
	]);
});
