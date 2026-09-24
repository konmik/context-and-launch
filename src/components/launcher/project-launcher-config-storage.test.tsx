import { afterEach, expect, it, vi } from 'vitest';
import { createSignal, flush } from 'solid-js';
import { cleanup, fireEvent, render, screen, waitFor } from '~/test-render.js';
import { createStoredSignal } from '~/util/stored-signal.js';
import { fail, succeed } from '~/util/result.js';
import type { LauncherConfig } from '~/core/launcher/launcher-config-data.js';
import { ProjectLauncherConfigContext, createProjectLauncherConfigStorage } from './project-launcher-config-storage.js';
import { LauncherConfigContext } from './shared-launcher-config-storage.js';
import { ItemSection } from './launcher-settings-item-section.js';

afterEach(cleanup);

it('switches the project store without remounting the editor and edits the selected project', async () => {
	const initial: LauncherConfig = { templates: [], skills: [], profiles: [{ name: 'Agent', command: 'first' }] };
	const secondConfig = { ...initial, profiles: [{ name: 'Agent', command: 'second' }] };
	const saved = new Map<string, LauncherConfig>([['first', initial], ['second', secondConfig]]);
	let completeRead!: () => void;
	const release = vi.fn(async () => {});
	const shared = createStoredSignal<LauncherConfig>(() => ({ templates: [], skills: [] }),
		async transform => succeed(transform({ templates: [], skills: [] })));
	const [selected, setSelected] = createSignal('first');
	const storage = createProjectLauncherConfigStorage({ get projectSlug() { return selected(); } }, {
		async read(slug, owner) {
			if (slug === 'first' && owner) await new Promise<void>(resolve => { completeRead = resolve; });
			return succeed(saved.get(slug)!);
		},
		async save(slug, json) {
			saved.set(slug, JSON.parse(json));
			return succeed(saved.get(slug)!);
		},
		release,
	});
	let mounts = 0;
	function Editor() {
		mounts++;
		return <ItemSection open heading="Agents" itemType="profile" addButtonTestId="add"
			rowTestId="row" dragHandleTestId="drag" editTestId="edit" deleteTestId="delete" />;
	}
	render(() => <LauncherConfigContext value={shared}>
		<ProjectLauncherConfigContext value={storage}><Editor /></ProjectLauncherConfigContext>
	</LauncherConfigContext>);
	await waitFor(() => expect(screen.getByTestId('row').textContent).toContain('first'));
	const pending = storage.update(current => ({ ...current, branchPrefix: 'first-only/' }));
	await waitFor(() => expect(completeRead).toBeTypeOf('function'));
	setSelected('second');
	await waitFor(() => expect(screen.getByTestId('row').textContent).toContain('second'));
	expect(mounts).toBe(1);
	completeRead();
	await pending;
	expect(saved.get('first')?.branchPrefix).toBe('first-only/');
	expect(storage.get().branchPrefix).toBeUndefined();
	expect(release).toHaveBeenCalledWith('first', expect.any(String));
	fireEvent.click(screen.getByTestId('delete'));
	await waitFor(() => expect(saved.get('second')?.profiles).toEqual([]));
	expect(saved.get('first')?.profiles).toEqual(initial.profiles);
});

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
